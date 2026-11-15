import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import * as protobuf from 'protobufjs';
import { createTemplate, defaultBoxes, importTemplate, listLibraries, listTemplates, proPresenterRoots, removeTemplate, watchDir } from '../src/library';
import { buildPro, PROTO_DIR, readSlideModel } from '../src/pro';

// PNG 1×1 sintético.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** Plantilla de una slide con un fondo de imagen referenciado por `url`. */
async function templateWithImage(file: string, url: Record<string, unknown>, slides = 1): Promise<void> {
  const slide = { label: 'Diseño', text: 'Texto' };
  await buildPro({ name: 'Plantilla', slides: Array(slides).fill(slide), outPath: file });
  const root = await protobuf.load(path.join(PROTO_DIR, 'presentation.proto'));
  const P = root.lookupType('rv.data.Presentation');
  const presentation = P.decode(await readFile(file)) as protobuf.ReflectedMessage;
  const base = presentation.cues[0].actions[0].slide.presentation.baseSlide;
  base.elements.push({ element: { uuid: { string: 'FONDO' }, opacity: 1, bounds: { origin: {}, size: { width: 1920, height: 1080 } },
    fill: { enable: true, media: { url, image: { file: { localUrl: url } } } } } });
  await writeFile(file, P.encode(presentation).finish());
}

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

test('importa una plantilla, copia su fondo y la vista previa no depende de ProPresenter', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-import-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const show = path.join(dir, 'workspace');
  await mkdir(path.join(show, 'Media/Assets'), { recursive: true });
  await writeFile(path.join(show, 'Media/Assets/fondo.png'), PNG);
  const store = path.join(dir, 'plantillas');
  // Solo ruta relativa al workspace (así exporta ProPresenter 22).
  const source = path.join(dir, 'Juan 3.16 (Fondo).pro');
  await templateWithImage(source, { local: { root: 10, path: 'Media/Assets/fondo.png' } });
  assert.equal(await importTemplate(source, store, [show]), 'Juan 3.16 (Fondo)');
  await rm(show, { recursive: true });
  const [item] = await listTemplates(store);
  assert.equal(item.name, 'Juan 3.16 (Fondo)');
  const model = await readSlideModel(item.path);
  assert(model.elements.some(element => element.image === `data:image/png;base64,${PNG.toString('base64')}`), 'Falta el fondo copiado');
  assert.deepEqual(await readdir(path.join(store, 'media', item.name)), ['1.png']);
  assert.deepEqual((await readdir(store)).sort(), ['Juan 3.16 (Fondo).pro', 'media'], 'No deben quedar temporales');

  // Reimportar reemplaza la plantilla y su carpeta de medios.
  await writeFile(path.join(dir, 'otro.png'), PNG);
  await templateWithImage(source, { absoluteString: pathToFileURL(path.join(dir, 'otro.png')).href });
  await importTemplate(source, store, []);
  assert.equal((await listTemplates(store)).length, 1);

  await removeTemplate(item.name, store);
  assert.deepEqual(await listTemplates(store), []);
  assert(!existsSync(path.join(store, 'media', item.name)));
});

test('rechaza plantillas con varias slides, medios ausentes o archivos ilegibles', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-import-bad-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = path.join(dir, 'plantillas');
  const multi = path.join(dir, 'Varias.pro');
  await writeFile(path.join(dir, 'fondo.png'), PNG);
  await templateWithImage(multi, { absoluteString: pathToFileURL(path.join(dir, 'fondo.png')).href }, 3);
  await assert.rejects(importTemplate(multi, store, []), /1 diapositiva y esta tiene 3/);
  const missing = path.join(dir, 'Sin fondo.pro');
  await templateWithImage(missing, { local: { root: 10, path: 'Media/Assets/no-existe.png' } });
  await assert.rejects(importTemplate(missing, store, [dir]), /No se encuentra el medio «no-existe.png»/);
  const broken = path.join(dir, 'Rota.pro');
  await writeFile(broken, Buffer.from([255]));
  await assert.rejects(importTemplate(broken, store, []), /No parece una presentación/);
  assert.deepEqual(await listTemplates(store), []);
  assert.deepEqual(await readdir(store), ['media'], 'Un fallo no deja temporales');
});

test('importa un .proBundle con sus medios dentro', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-bundle-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const content = path.join(dir, 'contenido');
  await mkdir(path.join(content, 'Media/Assets'), { recursive: true });
  await writeFile(path.join(content, 'Media/Assets/fondo paquete.png'), PNG);
  await templateWithImage(path.join(content, 'Versiculos.pro'), { local: { root: 10, path: 'Media/Assets/fondo paquete.png' } });
  const bundle = path.join(dir, 'Versiculos.proBundle');
  execFileSync('/usr/bin/ditto', ['-c', '-k', content, bundle]);
  const store = path.join(dir, 'plantillas');
  assert.equal(await importTemplate(bundle, store, []), 'Versiculos');
  const [item] = await listTemplates(store);
  assert((await readSlideModel(item.path)).elements.some(element => element.image?.startsWith('data:image/png')));
});

test('encuentra workspaces de ProPresenter 22 y el clásico', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-roots-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'Workspaces/abc'), { recursive: true });
  await writeFile(path.join(dir, 'Workspaces/registro.sqlite3'), '');
  assert.deepEqual(await proPresenterRoots(dir), [path.join(dir, 'Workspaces/abc'), path.join(dir, 'UserWorkspaces/ProPresenter')]);
});

/** Bitmap BGRA con filas opacas en [from, to). */
function bitmap(width: number, height: number, from: number, to: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = from; y < to; y++) for (let x = 0; x < width; x++) pixels[(y * width + x) * 4 + 3] = 255;
  return pixels;
}

test('defaultBoxes coloca las cajas en la banda opaca y escala a 1920×1080', () => {
  // Banner como el de la iglesia: franja inferior opaca desde el 70 %.
  const { verse, reference } = defaultBoxes(bitmap(192, 108, 76, 108), 192, 108);
  assert(verse.y >= 760 && verse.y + verse.height <= reference.y && reference.y + reference.height <= 1080);
  assert.equal(verse.align, 'left');
  assert.equal(reference.align, 'right');
  // Totalmente opaca o totalmente transparente: toda la imagen.
  for (const [from, to] of [[0, 108], [0, 0]]) {
    const boxes = defaultBoxes(bitmap(192, 108, from, to), 192, 108);
    assert(boxes.verse.y < 100 && boxes.reference.y + boxes.reference.height > 1000);
  }
  // Varias bandas: gana la más alta.
  assert(defaultBoxes(bitmap(192, 108, 0, 5), 192, 108).verse.y < 10);
  const two = bitmap(192, 108, 0, 5);
  two.set(bitmap(192, 108, 60, 100).subarray(60 * 192 * 4), 60 * 192 * 4);
  assert(defaultBoxes(two, 192, 108).verse.y > 600);
});

test('createTemplate arma la plantilla desde una imagen con letra y cajas elegidas', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-create-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const image = path.join(dir, 'banner.png');
  await writeFile(image, PNG);
  const store = path.join(dir, 'plantillas');
  const font = { postscriptName: 'Georgia-Bold', family: 'Georgia', style: 'Bold' };
  // La cita es más grande que el versículo: los roles fijos deben ganar al criterio por área.
  const draft = {
    name: 'Banner iglesia',
    verse: { x: 200, y: 800, width: 600, height: 100, font, size: 50, color: '#ff0000', align: 'center' as const },
    reference: { x: 100, y: 100, width: 1700, height: 600, font, size: 30, color: '#00ff00', align: 'right' as const },
  };
  assert.equal(await createTemplate(draft, { path: image, width: 1, height: 1 }, store), 'Banner iglesia');
  const [item] = await listTemplates(store);
  const roles = { verse: 0, reference: 1 };
  const model = await readSlideModel(item.path, { text: 'Porque de tal manera', reference: 'Juan 3:16' }, roles);
  assert.equal(model.background, 'rgba(0,0,0,0)');
  const [verse, reference, background] = model.elements;
  assert.deepEqual([verse.role, verse.text?.content, verse.text?.fontFamily, verse.text?.fontSize, verse.text?.color, verse.text?.align, verse.text?.bold],
    ['verse', 'Porque de tal manera', 'Georgia', 50, 'rgba(255,0,0,1)', 'center', true]);
  assert.deepEqual([reference.role, reference.text?.content, reference.x, reference.text?.align], ['reference', 'Juan 3:16', 100, 'right']);
  assert.equal(background.image, `data:image/png;base64,${PNG.toString('base64')}`);
  await rm(image);

  const out = path.join(dir, 'Juan 3.16.pro');
  await buildPro({ name: 'Juan 3:16', versionKey: 'RVR', slides: [{ label: 'Juan 3:16', text: 'Porque de tal manera' }], templatePath: item.path, roles, outPath: out });
  const generated = await readSlideModel(out);
  assert.deepEqual(generated.elements.map(element => element.text?.content), ['Porque de tal manera', 'Juan 3:16 RVR', undefined]);
  assert.equal(generated.elements[0].text?.fontFamily, 'Georgia');
  assert(generated.elements[2].image, 'El fondo vive en la carpeta de la app');
  await assert.rejects(createTemplate({ ...draft, name: '  ' }, { path: image, width: 1, height: 1 }, store), /Nombre de plantilla no válido/);
});
