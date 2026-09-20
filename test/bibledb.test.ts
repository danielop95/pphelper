import { strict as assert } from 'node:assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, TestContext } from 'node:test';
import { parseRef } from '../src/bible';
import { importXml, listBibles, localVerses, openDb, removeBible, renameBible } from '../src/bibledb';

function xml({ offset = 39, books = 27, count = 260, empty = 0, text = '  Jesús   &amp; &lt;vida&gt; &quot;sí&quot; &apos;él&apos; &#241; &#x1F64F; ' } = {}): string {
  return '\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n<bible translation="Prueba (edición)" status="Autor &amp; otros">\n<testament name="New">\n' +
    Array.from({ length: books }, (_, b) => `<book number="${b + 1 + offset}">\n<chapter number="1">\n` +
      Array.from({ length: count }, (_, v) => `<verse number="${v + 1}">${v < empty ? '  ' : text}</verse>`).join('\n') +
      '\n</chapter>\n</book>').join('\n') + '\n</testament>\n</bible>\n';
}

async function setup(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'pphelper-bibledb-'));
  const db = openDb(join(dir, 'bibles.sqlite'));
  t.after(async () => { db.close(); await rm(dir, { recursive: true, force: true }); });
  const file = join(dir, 'SpanishRVR1960Bible.xml');
  return { db, file };
}

test('importa BOM, entidades y acentos; persiste metadatos y consulta rangos como fetchVerses', async t => {
  const { db, file } = await setup(t);
  await writeFile(file, xml());
  const bible = await importXml(db, file);
  assert.deepEqual(bible, { id: 'rvr1960', name: 'Prueba', abbreviation: 'RVR1960', copyright: 'Autor & otros', verses: 7020, warnings: [] });
  assert.deepEqual(listBibles(db), [bible]);
  assert.deepEqual(localVerses(db, bible.id, parseRef('Juan 1:2')), [
    { book: 'JHN', chapter: 1, verse: 2, text: 'Jesús & <vida> "sí" \'él\' ñ 🙏' },
  ]);
  assert.deepEqual(localVerses(db, bible.id, parseRef('Juan 1:2-4')).map(v => v.verse), [2, 3, 4]);
  assert.equal(localVerses(db, bible.id, parseRef('Juan 1')).length, 260);
  assert.equal(localVerses(db, bible.id, parseRef('Juan 1:259-999')).length, 2);
  for (const ref of ['Juan 1:261-265', 'Juan 2', 'Salmos 23']) assert.deepEqual(localVerses(db, bible.id, parseRef(ref)), []);
  assert.deepEqual(localVerses(db, 'missing', parseRef('Juan 1')), []);
  assert.throws(() => localVerses(db, bible.id, { ...parseRef('Juan 1'), from: 0 }), /rango|versículos/i);
});

test('NT 1–27 aplica el offset y reimportar reemplaza sin dejar versículos antiguos', async t => {
  const { db, file } = await setup(t);
  await writeFile(file, xml({ offset: 0, count: 261 }));
  await importXml(db, file);
  assert.equal(localVerses(db, 'rvr1960', parseRef('Mateo 1')).length, 261);
  assert.equal(localVerses(db, 'rvr1960', parseRef('Apocalipsis 1')).length, 261);
  assert.deepEqual(localVerses(db, 'rvr1960', parseRef('Génesis 1')), []);
  await writeFile(file, xml({ text: 'Texto nuevo' }));
  await importXml(db, file);
  assert.equal(listBibles(db).length, 1);
  assert.equal(localVerses(db, 'rvr1960', parseRef('Mateo 1')).length, 260);
  assert.equal(localVerses(db, 'rvr1960', parseRef('Mateo 1:1'))[0].text, 'Texto nuevo');
});

test('XML truncado, inválido o incompleto revierte la importación entera', async t => {
  const { db, file } = await setup(t);
  await writeFile(file, xml());
  await importXml(db, file);
  const before = listBibles(db);
  for (const invalid of [
    xml({ text: 'Reemplazo' }).replace('</bible>', ''),
    xml().replace('</chapter>', ''),
    xml({ books: 26, count: 300 }),
    xml({ count: 259 }),
    xml({ count: 400, empty: 101 }),
    xml().replace('</book>', '<chapter number="2">\n<verse number="1"> </verse>\n</chapter>\n</book>'),
    xml().replace('<verse number="2">', '<verse number="1">'),
    xml().replace('&#241;', '&#x110000;'),
  ]) {
    await writeFile(file, invalid);
    await assert.rejects(importXml(db, file), /importar|XML|libros|versículos|entidad/i);
    assert.deepEqual(listBibles(db), before);
    assert.match(localVerses(db, 'rvr1960', parseRef('Juan 1:1'))[0].text, /^Jesús/);
  }
  await assert.rejects(importXml(db, file + '.missing'), /importar/i);
  assert.deepEqual(listBibles(db), before);
});

test('omite vacíos iniciales, valida abreviaturas y borra todos los datos de una Biblia', async t => {
  const { db, file } = await setup(t);
  await writeFile(file, xml({ count: 270, empty: 1 }));
  assert.equal((await importXml(db, file)).verses, 7263);
  assert.deepEqual(localVerses(db, 'rvr1960', parseRef('Juan 1:1')), []);
  renameBible(db, 'rvr1960', '  RV 60  ');
  assert.equal(listBibles(db)[0].abbreviation, 'RV 60');
  for (const name of ['', '  ', 'a'.repeat(21), 'a/b', 'a\\b', 'a\nb', 'a\u0000b', 'a\u007Fb', 'a\u0085b']) {
    assert.throws(() => renameBible(db, 'rvr1960', name), /abreviatura/i);
  }
  removeBible(db, 'rvr1960');
  assert.deepEqual(listBibles(db), []);
  assert.deepEqual(localVerses(db, 'rvr1960', parseRef('Juan 1')), []);
});

test('fusiona vacíos consecutivos y consulta intervalos solapados sin duplicados', async t => {
  const { db, file } = await setup(t);
  let content = xml({ count: 270, empty: 1 });
  for (const number of [3, 4, 6]) content = content.replace(new RegExp(`<verse number="${number}">[^<]*</verse>`, 'g'), `<verse number="${number}"> </verse>`);
  await writeFile(file, content);
  const bible = await importXml(db, file);
  assert.ok(bible.warnings.includes('81 versículos agrupados con el anterior.'));
  const lookup = (range: string) => localVerses(db, 'rvr1960', parseRef(`Juan 1:${range}`))
    .map(v => ({ verse: v.verse, verseEnd: v.verseEnd }));
  assert.deepEqual(lookup('1'), []);
  assert.deepEqual(lookup('3'), [{ verse: 2, verseEnd: 4 }]);
  assert.deepEqual(lookup('3-6'), [{ verse: 2, verseEnd: 4 }, { verse: 5, verseEnd: 6 }]);
  assert.deepEqual(lookup('4-7'), [{ verse: 2, verseEnd: 4 }, { verse: 5, verseEnd: 6 }, { verse: 7, verseEnd: undefined }]);
  assert.equal(localVerses(db, 'rvr1960', { ...parseRef('Juan 1'), from: 4 })[0].verse, 2);
});

test('acepta capítulos vacíos con avisos persistidos sin fusionar entre capítulos', async t => {
  const { db, file } = await setup(t);
  await writeFile(file, xml().replace('</book>', '<chapter number="2">\n</chapter>\n<chapter number="3">\n</chapter>\n</book>'));
  const bible = await importXml(db, file);
  assert.ok(bible.warnings.includes('Sin texto en el archivo: Mateo 2, Mateo 3.'));
  assert.deepEqual(listBibles(db), [bible]);
  assert.deepEqual(localVerses(db, bible.id, parseRef('Mateo 2')), []);
  assert.deepEqual(localVerses(db, bible.id, parseRef('Mateo 3')), []);
  assert.equal(localVerses(db, bible.id, parseRef('Mateo 1:260'))[0].verseEnd, undefined);
});
