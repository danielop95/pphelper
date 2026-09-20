import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { BOOKS, fetchVerses, formatRef, parseRef } from '../src/bible';
import { mergeSlides, splitSlide, toSlides } from '../src/split';
import { Verse } from '../src/types';

test('parseRef reconoce libros, abreviaturas, acentos y capítulos completos', () => {
  const cases: [string, string, number, number, number][] = [
    ['Juan 3:16', 'JHN', 3, 16, 16], ['Jn 3.16-18', 'JHN', 3, 16, 18],
    ['1 co 13', '1CO', 13, 1, 0], ['Salmos 23', 'PSA', 23, 1, 0],
    ['salmo 23:1-6', 'PSA', 23, 1, 6], ['1Co 13:4', '1CO', 13, 4, 4],
    ['Apocalipsis 21', 'REV', 21, 1, 0], ['  GÉNESIS  1:1 ', 'GEN', 1, 1, 1],
    ['2 tes 3:1', '2TH', 3, 1, 1], ['Cantar de los Cantares 2', 'SNG', 2, 1, 0],
  ];
  for (const [input, bookId, chapter, from, to] of cases) {
    const ref = parseRef(input);
    assert.deepEqual(ref, { bookId, bookName: BOOKS.find(b => b.id === bookId)!.name, chapter, from, to });
  }
  assert.equal(BOOKS.length, 66);
  assert.equal(new Set(BOOKS.map(b => b.id)).size, 66);
  for (const book of BOOKS) {
    for (const alias of [book.name, book.id, ...book.aliases]) assert.equal(parseRef(`${alias} 1`).bookId, book.id);
  }
  assert.equal(formatRef(parseRef('Jn 3.16-18')), 'Juan 3:16-18');
  assert.equal(formatRef(parseRef('Jn 3:16')), 'Juan 3:16');
  assert.equal(formatRef(parseRef('salmo 23')), 'Salmos 23');
});

test('parseRef rechaza formatos, números y libros inválidos con mensajes claros', () => {
  for (const input of ['', 'Juan', 'Juan 0', 'Juan 3:0', 'Juan 3:18-16', 'Juan 3:16-', 'Juan 3:16 texto', 'Juan 3:1.5', 'Juan 99999999999999999999']) {
    assert.throws(() => parseRef(input), /formato|capítulo|versículo/i, input);
  }
  assert.throws(() => parseRef('Inventado 3:16'), /libro/i);
});

const verses: Verse[] = [
  { book: 'JHN', chapter: 3, verse: 16, text: 'Amó al mundo; dio a su Hijo.' },
  { book: 'JHN', chapter: 3, verse: 17, text: 'Para salvar al mundo.' },
];

test('toSlides corta por puntuación, conserva el texto y no muta', () => {
  const before = structuredClone(verses);
  const slides = toSlides(verses, 'Juan', 16);
  assert.deepEqual(slides.slice(0, 2), [
    { label: 'Juan 3:16a', text: 'Amó al mundo;' },
    { label: 'Juan 3:16b', text: 'dio a su Hijo.' },
  ]);
  assert.ok(slides.every(s => s.text.length <= 16 && s.text.length > 0));
  assert.equal(slides.map(s => s.text).join(' '), verses.map(v => v.text).join(' '));
  assert.deepEqual(verses, before);
  assert.equal(toSlides(verses, 'Juan', 100)[0].label, 'Juan 3:16');
  const many = toSlides([{ ...verses[0], text: 'x'.repeat(100) }], 'Juan', 3);
  assert.equal(many.map(s => s.text).join(''), 'x'.repeat(100));
  assert.equal(new Set(many.map(s => s.label)).size, many.length);
  assert.throws(() => toSlides(verses, 'Juan', 0), /límite/i);
});

test('mergeSlides y splitSlide derivan labels y devuelven arrays nuevos', () => {
  const slides = toSlides(verses, 'Juan', 100);
  const before = structuredClone(slides);
  assert.deepEqual(mergeSlides(slides, 0), [{ label: 'Juan 3:16-17', text: verses.map(v => v.text).join(' ') }]);
  const parts = splitSlide(slides, 0, 11);
  assert.deepEqual(parts.slice(0, 2), [
    { label: 'Juan 3:16a', text: 'Amó al mundo;' },
    { label: 'Juan 3:16b', text: 'dio a su Hijo.' },
  ]);
  assert.equal(mergeSlides(parts, 0)[0].label, 'Juan 3:16a-b');
  assert.deepEqual(splitSlide(parts, 0, 4).slice(0, 2).map(s => s.label), ['Juan 3:16aa', 'Juan 3:16ab']);
  assert.equal(mergeSlides([{ label: 'Juan 3:16-17', text: 'a' }, { label: 'Juan 3:18', text: 'b' }], 0)[0].label, 'Juan 3:16-18');
  assert.deepEqual(slides, before);
  assert.notEqual(parts, slides);
  assert.throws(() => mergeSlides(slides, 1), /índice/i);
  assert.throws(() => splitSlide(slides, 0, 0), /posición/i);
});

test('toSlides reparte 500 caracteres en tres partes equilibradas', () => {
  const text = 'Palabra de vida, '.repeat(29) + 'Amén sí';
  assert.equal(text.length, 500);
  const slides = toSlides([{ ...verses[0], text }], 'Juan', 180);
  const lengths = slides.map(s => s.text.length);
  assert.deepEqual(slides.map(s => s.label), ['Juan 3:16a', 'Juan 3:16b', 'Juan 3:16c']);
  assert.ok(Math.max(...lengths) / Math.min(...lengths) < 1.35);
  assert.ok(lengths.every(length => length > 0 && length <= 180));
  assert.equal(slides.map(s => s.text).join(' '), text);
});

test('toSlides acumula versículos cortos, deriva rangos y conserva la entrada', () => {
  const input = ['Jesús lloró.', 'Lo amaba.', 'Y fue allí.', 'x'.repeat(60)]
    .map((text, i) => ({ ...verses[0], verse: i + 1, text }));
  const before = structuredClone(input);
  const limits = { minChars: 30, maxChars: 80 };
  assert.deepEqual(toSlides(input, 'Juan', limits), [
    { label: 'Juan 3:1-3', text: 'Jesús lloró. Lo amaba. Y fue allí.' },
    { label: 'Juan 3:4', text: 'x'.repeat(60) },
  ]);
  assert.deepEqual(input, before);
  assert.deepEqual(limits, { minChars: 30, maxChars: 80 });
  assert.deepEqual(toSlides(input, 'Juan', { minChars: 0, maxChars: 80 }),
    input.map(v => ({ label: `Juan 3:${v.verse}`, text: v.text })));
  assert.deepEqual(toSlides(input, 'Juan', 80), toSlides(input, 'Juan', { minChars: 0, maxChars: 80 }));
});

test('toSlides solo permite exceder el máximo al unir la cola corta final', () => {
  const make = (lengths: number[]) => lengths.map((length, i) => ({ ...verses[0], verse: i + 1, text: 'x'.repeat(length) }));
  const limits = { minChars: 30, maxChars: 100 };
  assert.deepEqual(toSlides(make([80, 19]), 'Juan', limits).map(s => s.label), ['Juan 3:1-2']);
  assert.deepEqual(toSlides(make([100, 14]), 'Juan', limits), [{ label: 'Juan 3:1-2', text: `${'x'.repeat(100)} ${'x'.repeat(14)}` }]);
  assert.deepEqual(toSlides(make([100, 15]), 'Juan', limits).map(s => s.text.length), [100, 15]);
  assert.deepEqual(toSlides(make([100, 14, 100]), 'Juan', limits).map(s => s.text.length), [100, 14, 100]);
});

test('toSlides no une partes de un versículo ni referencias discontinuas', () => {
  const input = [
    { ...verses[0], verse: 1, text: 'Jesús lloró.' },
    { ...verses[0], verse: 2, text: 'x'.repeat(101) },
    { ...verses[0], verse: 3, text: 'Amén.' },
  ];
  assert.deepEqual(toSlides(input, 'Juan', { minChars: 80, maxChars: 100 }).map(s => s.label),
    ['Juan 3:1', 'Juan 3:2a', 'Juan 3:2b', 'Juan 3:3']);
  for (const next of [{ ...input[0], verse: 3 }, { ...input[0], chapter: 4 }, { ...input[0], book: 'GEN', verse: 2 }]) {
    assert.equal(toSlides([input[0], next], 'Juan', { minChars: 80, maxChars: 100 }).length, 2);
  }
  for (const limits of [{ minChars: -1, maxChars: 10 }, { minChars: 11, maxChars: 10 }, { minChars: NaN, maxChars: 10 }, { minChars: 0, maxChars: Infinity }]) {
    assert.throws(() => toSlides(input, 'Juan', limits), /límite/i);
  }
});

test('toSlides prefiere puntuación cercana seguida de espacio y respeta el máximo', () => {
  for (const mark of ['.', ';', ':', ',', '?', '!']) {
    const text = `${'a'.repeat(43)}${mark} ${'b'.repeat(55)}`;
    assert.deepEqual(toSlides([{ ...verses[0], text }], 'Juan', 60).map(s => s.text.length), [44, 55]);
  }
  for (const text of [`${'a'.repeat(10)}. ${'b'.repeat(37)} ${'c'.repeat(50)}`, `${'a'.repeat(43)}?${'b'.repeat(5)} ${'c'.repeat(50)}`]) {
    assert.deepEqual(toSlides([{ ...verses[0], text }], 'Juan', 60).map(s => s.text.length), [49, 50]);
  }
  const text = `${'a'.repeat(53)}. ${'b'.repeat(45)}`;
  assert.ok(toSlides([{ ...verses[0], text }], 'Juan', 50).every(s => s.text.length <= 50));
});

test('fetchVerses usa caché precargada sin red y filtra el rango', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pphelper-cache-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'test-bible', 'JHN'), { recursive: true });
  await writeFile(join(dir, 'test-bible', 'JHN', '3.json'), JSON.stringify(verses));
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('No debe hacer red'); });
  assert.deepEqual(await fetchVerses(parseRef('Jn 3:16'), 'test-bible', '', dir), [verses[0]]);
  assert.deepEqual(await fetchVerses(parseRef('Jn 3'), 'test-bible', '', dir), verses);
});

test('fetchVerses descarga el capítulo una vez, limpia y guarda todos los versículos', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pphelper-fetch-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const mock = t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, options?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/v1/bibles/test-bible/chapters/JHN.3');
    assert.equal(url.searchParams.get('content-type'), 'text');
    assert.equal(url.searchParams.get('include-verse-numbers'), 'true');
    for (const key of ['include-notes', 'include-titles', 'include-chapter-numbers']) assert.equal(url.searchParams.get(key), 'false');
    assert.equal(new Headers(options?.headers).get('api-key'), 'test-key');
    return new Response(JSON.stringify({ data: { content: '\n[16] Amó  al mundo;\n\n dio a su Hijo. [17] Para salvar al mundo.\n' } }));
  });
  assert.deepEqual(await fetchVerses(parseRef('Jn 3:16'), 'test-bible', 'test-key', dir), [verses[0]]);
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'test-bible', 'JHN', '3.json'), 'utf8')), verses);
  assert.deepEqual(await fetchVerses(parseRef('Jn 3:17'), 'test-bible', 'test-key', dir), [verses[1]]);
  assert.equal(mock.mock.callCount(), 1);
});

test('fetchVerses rechaza errores HTTP, contenido inválido e identificadores inseguros', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pphelper-errors-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 403 }));
  const ref = parseRef('Jn 3');
  await assert.rejects(fetchVerses(ref, 'test-bible', 'key', dir), /HTTP 403/);
  mock.mock.mockImplementation(async () => new Response(JSON.stringify({ data: { content: 'Sin marcadores' } })));
  await assert.rejects(fetchVerses(ref, 'test-bible', 'key', dir), /versículos|contenido/i);
  await assert.rejects(fetchVerses(ref, '../escape', 'key', dir), /identificador/i);
});

test('versículos agrupados conservan rangos al cortar y unir', () => {
  const grouped = [{ book: 'GEN', chapter: 2, verse: 1, verseEnd: 3, text: 'Texto de un grupo.' },
    { book: 'GEN', chapter: 2, verse: 4, verseEnd: 5, text: 'Otro grupo.' }];
  assert.deepEqual(toSlides(grouped, 'Génesis', 100).map(s => s.label), ['Génesis 2:1-3', 'Génesis 2:4-5']);
  assert.equal(toSlides(grouped, 'Génesis', { minChars: 40, maxChars: 100 })[0].label, 'Génesis 2:1-5');
  const parts = toSlides(grouped.slice(0, 1), 'Génesis', 10);
  assert.deepEqual(parts.map(s => s.label), ['Génesis 2:1-3a', 'Génesis 2:1-3b']);
  assert.equal(mergeSlides(parts, 0)[0].label, 'Génesis 2:1-3b');
  assert.equal(mergeSlides([{ label: 'Génesis 2:1-3', text: 'a' }, { label: 'Génesis 2:1-3', text: 'b' }], 0)[0].label, 'Génesis 2:1-3');
});
