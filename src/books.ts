import type { BibleOutline, ParsedRef } from './types';

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

export interface RefAssist { suggestions: { id: string; label: string }[]; hint: string; invalid: boolean }

// Ayuda en vivo mientras se escribe: sugiere libros y, con una Biblia local, avisa de capítulos y versículos inexistentes.
export function refAssist(input: string, outline?: BibleOutline | null): RefAssist {
  const text = input.trim();
  const match = text.match(/^(.+?)\s+(\d+)(?:\s*[:.]\s*(\d*)(?:\s*-\s*(\d*))?)?$/);
  if (!match) {
    const typed = normalize(text);
    const suggestions = !typed ? [] : BOOKS.filter(b => [b.name, ...b.aliases].some(alias => normalize(alias).startsWith(typed)))
      .slice(0, 8).map(b => ({ id: `${b.name} `, label: b.name })).filter(s => s.id !== input);
    return { suggestions, hint: '', invalid: false };
  }
  const book = BOOKS.find(b => [b.id, b.name, ...b.aliases].some(alias => normalize(alias) === normalize(match[1])));
  if (!book) return { suggestions: [], hint: `Libro no reconocido: «${match[1]}».`, invalid: true };
  if (!outline) return { suggestions: [], hint: '', invalid: false };
  const chapters = outline[book.id];
  if (!chapters?.length) return { suggestions: [], hint: `${book.name} no está en esta Biblia.`, invalid: true };
  const chapter = Number(match[2]);
  if (chapter < 1 || chapter > chapters.length) return { suggestions: [], hint: `${book.name} tiene ${chapters.length} capítulo${chapters.length === 1 ? '' : 's'}.`, invalid: true };
  const verses = chapters[chapter - 1];
  if (!verses) return { suggestions: [], hint: `${book.name} ${chapter} no tiene texto en esta Biblia.`, invalid: true };
  if ([match[3], match[4]].some(value => value && (Number(value) < 1 || Number(value) > verses))) {
    return { suggestions: [], hint: `${book.name} ${chapter} tiene ${verses} versículos.`, invalid: true };
  }
  return { suggestions: [], hint: `${book.name} ${chapter}: ${verses} versículos`, invalid: false };
}
