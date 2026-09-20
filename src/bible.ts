import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ParsedRef, Verse } from './types';

export const BOOKS: { id: string; name: string; aliases: string[] }[] = [
  ['GEN', 'Génesis', 'gn,gen'], ['EXO', 'Éxodo', 'ex,exo'],
  ['LEV', 'Levítico', 'lv,lev'], ['NUM', 'Números', 'nm,num'],
  ['DEU', 'Deuteronomio', 'dt,deut'], ['JOS', 'Josué', 'jos'],
  ['JDG', 'Jueces', 'jue,juec'], ['RUT', 'Rut', 'rt'],
  ['1SA', '1 Samuel', '1sm,1sam'], ['2SA', '2 Samuel', '2sm,2sam'],
  ['1KI', '1 Reyes', '1r,1re,1rey'], ['2KI', '2 Reyes', '2r,2re,2rey'],
  ['1CH', '1 Crónicas', '1cr,1cron'], ['2CH', '2 Crónicas', '2cr,2cron'],
  ['EZR', 'Esdras', 'esd'], ['NEH', 'Nehemías', 'ne,neh'],
  ['EST', 'Ester', 'est'], ['JOB', 'Job', 'jb'],
  ['PSA', 'Salmos', 'salmo,sal,sl,s'], ['PRO', 'Proverbios', 'pr,prov'],
  ['ECC', 'Eclesiastés', 'ec,ecl'], ['SNG', 'Cantares', 'cantar,cantar de los cantares,cnt,cant'],
  ['ISA', 'Isaías', 'is,isa'], ['JER', 'Jeremías', 'jer,jr'],
  ['LAM', 'Lamentaciones', 'lm,lam'], ['EZK', 'Ezequiel', 'ez,ezq'],
  ['DAN', 'Daniel', 'dn,dan'], ['HOS', 'Oseas', 'os'],
  ['JOL', 'Joel', 'jl'], ['AMO', 'Amós', 'am'],
  ['OBA', 'Abdías', 'abd,ab'], ['JON', 'Jonás', 'jon'],
  ['MIC', 'Miqueas', 'miq,mi'], ['NAM', 'Nahúm', 'nah,na'],
  ['HAB', 'Habacuc', 'hab,hb'], ['ZEP', 'Sofonías', 'sof'],
  ['HAG', 'Hageo', 'hag,hg'], ['ZEC', 'Zacarías', 'zac,zc'],
  ['MAL', 'Malaquías', 'mal,ml'], ['MAT', 'Mateo', 'mt,mat'],
  ['MRK', 'Marcos', 'mc,mr'], ['LUK', 'Lucas', 'lc,luc'],
  ['JHN', 'Juan', 'jn,jua'], ['ACT', 'Hechos', 'hch,hechos de los apostoles'],
  ['ROM', 'Romanos', 'ro,rom'], ['1CO', '1 Corintios', '1co,1cor'],
  ['2CO', '2 Corintios', '2co,2cor'], ['GAL', 'Gálatas', 'ga,gal'],
  ['EPH', 'Efesios', 'ef'], ['PHP', 'Filipenses', 'fil,flp'],
  ['COL', 'Colosenses', 'col'], ['1TH', '1 Tesalonicenses', '1ts,1tes'],
  ['2TH', '2 Tesalonicenses', '2ts,2tes'], ['1TI', '1 Timoteo', '1ti,1tim'],
  ['2TI', '2 Timoteo', '2ti,2tim'], ['TIT', 'Tito', 'tit'],
  ['PHM', 'Filemón', 'flm,filem'], ['HEB', 'Hebreos', 'heb'],
  ['JAS', 'Santiago', 'stg,sant'], ['1PE', '1 Pedro', '1p,1pe,pedro primero'],
  ['2PE', '2 Pedro', '2p,2pe'], ['1JN', '1 Juan', '1jn'],
  ['2JN', '2 Juan', '2jn'], ['3JN', '3 Juan', '3jn'],
  ['JUD', 'Judas', 'jud'], ['REV', 'Apocalipsis', 'ap,apoc'],
].map(([id, name, aliases]) => ({ id, name, aliases: aliases.split(',') }));

const normalize = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s.]/g, '');

export function parseRef(input: string): ParsedRef {
  const match = input.trim().match(/^(.+?)\s+(\d+)(?:\s*[:.]\s*(\d+)(?:\s*-\s*(\d+))?)?$/);
  if (!match) throw new Error('Formato de referencia inválido. Usa «Juan 3:16-18» o «Salmos 23».');
  const book = BOOKS.find(b => [b.id, b.name, ...b.aliases].some(alias => normalize(alias) === normalize(match[1])));
  if (!book) throw new Error(`Libro no reconocido: «${match[1]}».`);
  const chapter = Number(match[2]);
  const from = match[3] ? Number(match[3]) : 1;
  const to = match[4] ? Number(match[4]) : match[3] ? from : 0;
  if (![chapter, from, to].every(Number.isSafeInteger) || chapter < 1 || from < 1 || (match[3] && to < from)) {
    throw new Error('Capítulo o rango de versículos inválido: usa números positivos y un rango ascendente.');
  }
  return { bookId: book.id, bookName: book.name, chapter, from, to };
}

export function formatRef(ref: ParsedRef): string {
  return `${ref.bookName} ${ref.chapter}${ref.to === 0 ? '' : `:${ref.from}${ref.to === ref.from ? '' : `-${ref.to}`}`}`;
}

export async function fetchVerses(ref: ParsedRef, bibleId: string, apiKey: string, cacheDir: string): Promise<Verse[]> {
  if (!/^[\w-]+$/.test(bibleId) || !BOOKS.some(b => b.id === ref.bookId)) throw new Error('Identificador de Biblia o libro inválido.');
  if (![ref.chapter, ref.from, ref.to].every(Number.isSafeInteger) || ref.chapter < 1 || ref.from < 1 || (ref.to !== 0 && ref.to < ref.from)) {
    throw new Error('Capítulo o rango de versículos inválido.');
  }
  const dir = join(cacheDir, bibleId, ref.bookId);
  const file = join(dir, `${ref.chapter}.json`);
  let cached: string | undefined;
  try { cached = await readFile(file, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  let verses: Verse[];
  if (cached !== undefined) {
    const value: unknown = JSON.parse(cached);
    if (!Array.isArray(value) || !value.every(v => v && typeof v.book === 'string' && v.chapter === ref.chapter && Number.isSafeInteger(v.verse) && v.verse > 0 && typeof v.text === 'string')) {
      throw new Error('La caché de versículos contiene datos inválidos.');
    }
    verses = value;
  } else {
    if (!apiKey.trim()) throw new Error('Falta la clave de API.Bible.');
    // https://docs.api.bible/guides/chapters/: una llamada; los marcadores se eliminan al separar.
    const query = new URLSearchParams({ 'content-type': 'text', 'include-notes': 'false', 'include-titles': 'false', 'include-chapter-numbers': 'false', 'include-verse-numbers': 'true' });
    const response = await fetch(`https://api.scripture.api.bible/v1/bibles/${bibleId}/chapters/${ref.bookId}.${ref.chapter}?${query}`, {
      headers: { 'api-key': apiKey }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`API.Bible devolvió HTTP ${response.status}; comprueba la clave y sus permisos.`);
    const payload = await response.json();
    const content: unknown = payload?.data?.content;
    if (typeof content !== 'string') throw new Error('API.Bible devolvió contenido de capítulo inválido.');
    verses = Array.from(content.matchAll(/\[(\d+)\]([^]*?)(?=\[\d+\]|$)/g), match => ({
      book: ref.bookId, chapter: ref.chapter, verse: Number(match[1]), text: match[2].replace(/\s+/g, ' ').trim(),
    }));
    if (!verses.length || verses.some((v, i) => !v.text || !Number.isSafeInteger(v.verse) || v.verse < 1 || (i > 0 && v.verse <= verses[i - 1].verse))) {
      throw new Error('API.Bible devolvió un capítulo sin versículos válidos.');
    }
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify(verses));
  }
  return verses.filter(v => v.verse >= ref.from && (ref.to === 0 || v.verse <= ref.to));
}
