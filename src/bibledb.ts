import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { BOOKS } from './bible';
import { ParsedRef, Verse } from './types';

export interface LocalBible {
  id: string;
  name: string;
  abbreviation: string;
  copyright: string;
  verses: number;
  warnings: string[];
}

export function openDb(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS bibles (
      id TEXT PRIMARY KEY, name TEXT, abbreviation TEXT, copyright TEXT, verses INTEGER, warnings TEXT
    );
    CREATE TABLE IF NOT EXISTS verses (
      bible TEXT, book TEXT, chapter INTEGER, verse INTEGER, text TEXT, verse_end INTEGER,
      PRIMARY KEY(bible, book, chapter, verse)
    ) WITHOUT ROWID;`);
  return db;
}

function decode(value: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return value.replace(/&([^;\s]*);|&/g, (_, entity: string | undefined) => {
    if (entity && Object.hasOwn(entities, entity)) return entities[entity];
    if (entity && /^#(?:\d+|x[\da-f]+)$/i.test(entity)) {
      const code = /^#x/i.test(entity) ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (code === 9 || code === 10 || code === 13 ||
          (code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) && code !== 0xfffe && code !== 0xffff)) {
        return String.fromCodePoint(code);
      }
    }
    throw new Error('El XML contiene una entidad inválida.');
  }).replace(/\s+/g, ' ').trim();
}

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  const remainder = source.replace(/\s+([\w-]+)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/g, (_, key: string, double: string | undefined, single: string) => {
    if (Object.hasOwn(result, key)) throw new Error('El XML contiene atributos duplicados.');
    result[key] = decode(double ?? single);
    return '';
  });
  if (remainder.trim()) throw new Error('El XML contiene atributos inválidos.');
  return result;
}

function numberAttribute(attrs: Record<string, string>): number {
  const value = Number(attrs.number);
  if (!/^\d+$/.test(attrs.number ?? '') || !Number.isSafeInteger(value) || value < 1) {
    throw new Error('El XML contiene un número de libro, capítulo o versículo inválido.');
  }
  return value;
}

// ponytail: parser por líneas atado al formato Beblia; otros formatos necesitan otro importador.
export async function importXml(db: DatabaseSync, xmlPath: string): Promise<LocalBible> {
  const id = basename(xmlPath).replace(/\.xml$/i, '').replace(/Spanish|Bible/gi, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!id) throw new Error('El nombre del archivo no permite identificar la Biblia.');
  const bible: LocalBible = { id, name: '', abbreviation: id.toUpperCase(), copyright: '', verses: 0, warnings: [] };
  const stack: string[] = [];
  const books = new Set<string>();
  const emptyChapters: string[] = [];
  let testament = '', book = '', chapter = 0, omitted = 0, merged = 0, lastVerse = 0, lastNumber = 0;
  let started = false, complete = false, hasOld = false, relativeNT = false;
  db.exec('BEGIN IMMEDIATE');
  const input = createReadStream(xmlPath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    db.prepare('DELETE FROM verses WHERE bible = ?').run(id);
    const insert = db.prepare('INSERT INTO verses VALUES (?, ?, ?, ?, ?, ?)');
    const extend = db.prepare('UPDATE verses SET verse_end = ? WHERE bible = ? AND book = ? AND chapter = ? AND verse = ?');
    for await (const raw of lines) {
      const line = raw.replace(/^\uFEFF/, '').trim();
      if (!line) continue;
      if (!started && /^<\?xml\s[^>]*\?>$/.test(line)) continue;
      const verse = line.match(/^<verse\b([^>]*)>([^<]*)<\/verse>$/);
      if (verse) {
        if (stack.at(-1) !== 'chapter') throw new Error('El XML contiene un versículo fuera de capítulo.');
        const number = numberAttribute(attributes(verse[1]));
        if (number <= lastNumber) throw new Error('El XML contiene versículos duplicados o desordenados.');
        lastNumber = number;
        const text = decode(verse[2]);
        if (!text) {
          omitted++;
          if (lastVerse) { extend.run(number, id, book, chapter, lastVerse); merged++; }
          continue;
        }
        insert.run(id, book, chapter, number, text, number);
        lastVerse = number;
        books.add(book);
        bible.verses++;
        continue;
      }
      const close = line.match(/^<\/(bible|testament|book|chapter)>$/);
      if (close) {
        if (stack.pop() !== close[1]) throw new Error('El XML contiene etiquetas sin cerrar o desordenadas.');
        if (close[1] === 'chapter' && !lastVerse) {
          if (lastNumber) throw new Error('El XML contiene un capítulo cuyos versículos están todos vacíos.');
          emptyChapters.push(`${BOOKS.find(b => b.id === book)!.name} ${chapter}`);
        }
        if (close[1] === 'bible') complete = true;
        continue;
      }
      const open = line.match(/^<(bible|testament|book|chapter)\b([^>]*)>$/);
      if (!open || complete) throw new Error('El archivo no tiene el formato XML Beblia esperado.');
      const [, tag, source] = open;
      const parent = stack.at(-1);
      const attrs = attributes(source);
      if (tag === 'bible' && parent === undefined && !started) {
        started = true;
        bible.name = (attrs.translation ?? '').replace(/\s*\([^()]*\)\s*$/, '').trim();
        bible.copyright = attrs.status ?? '';
        if (!bible.name) throw new Error('Falta el nombre de traducción en el XML.');
      } else if (tag === 'testament' && parent === 'bible') {
        testament = attrs.name;
        if (testament !== 'Old' && testament !== 'New') throw new Error('Testamento XML no reconocido.');
        if (testament === 'Old') {
          if (relativeNT) throw new Error('La numeración relativa del Nuevo Testamento requiere una Biblia sin Antiguo Testamento.');
          hasOld = true;
        }
      } else if (tag === 'book' && parent === 'testament') {
        let number = numberAttribute(attrs);
        if (testament === 'New' && !hasOld && number <= 27) { number += 39; relativeNT = true; }
        if ((testament === 'Old' && number > 39) || (testament === 'New' && number < 40) || number > 66) {
          throw new Error('El XML contiene un libro fuera del canon de 66 libros.');
        }
        book = BOOKS[number - 1].id;
      } else if (tag === 'chapter' && parent === 'book') {
        chapter = numberAttribute(attrs);
        lastVerse = lastNumber = 0;
      } else {
        throw new Error('El XML contiene etiquetas desordenadas.');
      }
      stack.push(tag);
    }
    if (!complete || stack.length) throw new Error('El XML está truncado o incompleto.');
    if (books.size < 27 || bible.verses < 7000) throw new Error('La Biblia debe contener al menos 27 libros y 7000 versículos con texto.');
    if (omitted / (bible.verses + omitted) > 0.25) throw new Error(`El XML contiene más del 25% de versículos vacíos (${omitted} omitidos).`);
    if (emptyChapters.length) bible.warnings.push(`Sin texto en el archivo: ${emptyChapters.join(', ')}.`);
    if (merged) bible.warnings.push(`${merged} versículos agrupados con el anterior.`);
    if (omitted > merged) bible.warnings.push(`${omitted - merged} versículos vacíos sin anterior, omitidos.`);
    db.prepare('INSERT OR REPLACE INTO bibles VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, bible.name, bible.abbreviation, bible.copyright, bible.verses, JSON.stringify(bible.warnings));
    db.exec('COMMIT');
    return bible;
  } catch (error) {
    db.exec('ROLLBACK');
    if ((error as NodeJS.ErrnoException).code) throw new Error('No se pudo importar la Biblia: comprueba el archivo XML y que sus versículos no estén duplicados.', { cause: error });
    throw error;
  } finally {
    lines.close();
    input.destroy();
  }
}

export function listBibles(db: DatabaseSync): LocalBible[] {
  return db.prepare('SELECT * FROM bibles ORDER BY name, id').all().map(row => ({
    id: String(row.id), name: String(row.name), abbreviation: String(row.abbreviation),
    copyright: String(row.copyright), verses: Number(row.verses),
    warnings: JSON.parse(String(row.warnings)),
  }));
}

export function removeBible(db: DatabaseSync, id: string): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM verses WHERE bible = ?').run(id);
    db.prepare('DELETE FROM bibles WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw new Error('No se pudo eliminar la Biblia local.', { cause: error });
  }
}

export function renameBible(db: DatabaseSync, id: string, abbreviation: string): void {
  if (/[\/\\\u0000-\u001f\u007f-\u009f]/.test(abbreviation) || abbreviation.trim().length < 1 || abbreviation.trim().length > 20) {
    throw new Error('La abreviatura debe tener entre 1 y 20 caracteres, sin barras ni caracteres de control.');
  }
  db.prepare('UPDATE bibles SET abbreviation = ? WHERE id = ?').run(abbreviation.trim(), id);
}

export function localVerses(db: DatabaseSync, bibleId: string, ref: ParsedRef): Verse[] {
  if (!/^[\w-]+$/.test(bibleId) || !BOOKS.some(b => b.id === ref.bookId)) throw new Error('Identificador de Biblia o libro inválido.');
  if (![ref.chapter, ref.from, ref.to].every(Number.isSafeInteger) || ref.chapter < 1 || ref.from < 1 || (ref.to !== 0 && ref.to < ref.from)) {
    throw new Error('Capítulo o rango de versículos inválido.');
  }
  return db.prepare(`SELECT book, chapter, verse, verse_end, text FROM verses
    WHERE bible = ? AND book = ? AND chapter = ? AND verse_end >= ? AND (? = 0 OR verse <= ?) ORDER BY verse`)
    .all(bibleId, ref.bookId, ref.chapter, ref.from, ref.to, ref.to).map(row => ({
      book: String(row.book), chapter: Number(row.chapter), verse: Number(row.verse), text: String(row.text),
      ...(Number(row.verse_end) > Number(row.verse) ? { verseEnd: Number(row.verse_end) } : {}),
    }));
}
