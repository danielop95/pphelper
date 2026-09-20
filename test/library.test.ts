import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { listLibraries, listTemplates, watchDir } from '../src/library';
import { buildPro } from '../src/pro';

test('lista plantillas de una slide ordenadas e ignora archivos corruptos y otras entradas', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-library-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const slide = { label: 'Juan 3:16', text: 'Texto' };
  for (const name of ['Zeta.pro', 'Alfa.PRO', 'Dos.pro']) {
    await buildPro({ name, slides: name === 'Dos.pro' ? [slide, slide] : [slide], outPath: path.join(dir, name) });
  }
  await writeFile(path.join(dir, 'corrupto.pro'), Buffer.from([255]));
  await writeFile(path.join(dir, 'vacio.pro'), Buffer.alloc(0));
  await writeFile(path.join(dir, 'notas.txt'), 'notas');
  await mkdir(path.join(dir, 'carpeta.pro'));
  assert.deepEqual(await listTemplates(dir), ['Alfa.PRO', 'Zeta.pro'].map(file => ({
    name: file.slice(0, -4), path: path.join(dir, file), library: path.basename(dir),
  })));
  assert.deepEqual(await listTemplates(path.join(dir, 'no-existe')), []);
});

test('lista solo subcarpetas de bibliotecas con base inyectada', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-libraries-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'Zeta'));
  await mkdir(path.join(dir, 'Alfa'));
  await writeFile(path.join(dir, 'LibraryData'), 'índice');
  assert.deepEqual(await listLibraries(dir), ['Alfa', 'Zeta'].map(name => ({ name, path: path.join(dir, name) })));
  assert.deepEqual(await listLibraries(path.join(dir, 'no-existe')), []);
});

test('watchDir agrupa escrituras con debounce y permite cerrar y observar carpetas inexistentes', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-watch-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let changes = 0;
  const close = watchDir(dir, () => { changes++; });
  t.after(close);
  const file = path.join(dir, 'plantilla.pro');
  for (let i = 0; i < 4; i++) {
    await writeFile(file, String(i));
    await delay(30);
  }
  assert.equal(changes, 0);
  await delay(650);
  assert.equal(changes, 1);
  await writeFile(file, 'pendiente');
  await delay(50);
  close();
  await writeFile(file, 'cerrado');
  await delay(400);
  assert.equal(changes, 1);
  watchDir(path.join(dir, 'no-existe'), () => { changes++; })();
});
