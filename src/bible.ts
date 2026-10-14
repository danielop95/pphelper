import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BOOKS } from './books';
import { ParsedRef, Verse } from './types';

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
