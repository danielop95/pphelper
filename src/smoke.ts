import { app, dialog, type BrowserWindow } from 'electron';
import { strict as assert } from 'node:assert';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, promises as fsPromises } from 'node:fs';
import * as path from 'node:path';
import * as protobuf from 'protobufjs';
import { buildPro, PROTO_DIR, readSlideCount, readSlideModel } from './pro';

/** Real renderer + sandbox + IPC integration check; all user data stays in a temp directory. */
export async function runSmoke(win: BrowserWindow, dataPath: (...parts: string[]) => string): Promise<void> {
  const errors: string[] = [];
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  const timeout = setTimeout(() => { console.error('Smoke: tiempo agotado'); app.exit(1); }, 90000);
  const evaluate = (source: string) => win.webContents.executeJavaScript(source);
  const wait = async (source: string) => {
    for (let i = 0; i < 160; i++) { if (await evaluate(source)) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    mkdirSync(path.join(app.getAppPath(), 'scratch/out'), { recursive: true });
    writeFileSync(path.join(app.getAppPath(), 'scratch/out/app-next.png'), (await win.webContents.capturePage()).toPNG());
    console.error(await evaluate('document.body.innerText'));
    throw new Error(`Smoke: no se cumple ${source}`);
  };
  const selector = (id: string) => `[data-testid="${id}"]${id === 'reference' ? ' input' : ''}`;
  const query = (id: string) => `document.querySelector(${JSON.stringify(selector(id))})`;
  const click = async (id: string) => { await evaluate(`${query(id)}.click()`); };
  const type = async (id: string, value: string) => {
    await evaluate(`(() => { const el = ${query(id)}; Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  };
  const count = (n: number) => `document.querySelectorAll('[data-testid="slide-text"]').length === ${n}`;
  const ready = `${query('drag-card')}.draggable`;
  const library = dataPath('test-library');
  const templates = dataPath('test-templates');
  const cache = dataPath('bibles', 'smoke-bible', 'JHN');
  for (const dir of [library, templates, cache]) mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(cache, '3.json'), JSON.stringify([
    { book: 'JHN', chapter: 3, verse: 16, text: 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.' },
    { book: 'JHN', chapter: 3, verse: 17, text: 'Porque no envió Dios a su Hijo al mundo, para que condene al mundo, mas para que el mundo sea salvo por él.' },
  ]));
  const html = path.join(app.getAppPath(), 'dist/renderer/index.html');
  await win.loadFile(html);
  await wait(`document.documentElement.dataset.ready === 'true'`);
  assert.equal(await evaluate(`typeof require`), 'undefined');
  assert.equal(await evaluate('document.documentElement.dataset.sandboxed'), 'true');
  assert.equal(await evaluate('document.documentElement.dataset.isolated'), 'true');
  assert(win.isAlwaysOnTop());
  assert.match(await evaluate(`window.pphelper.listBibles().then(() => '', e => e.message)`), /Falta la clave/);
  // Validate the new config trust boundary before exercising the UI.
  for (const bad of [{ minChars: -1 }, { templateLimits: { bad: { minChars: 400, maxChars: 2 } } }, { templateLibrary: 'relative' }]) {
    assert(await evaluate(`window.pphelper.setConfig(${JSON.stringify(bad)}).then(() => false, () => true)`));
  }
  await evaluate(`window.pphelper.setConfig(${JSON.stringify({ versions: { PRUEBA: 'smoke-bible' }, minChars: 80, maxChars: 180, libraryPath: library, templateLibrary: templates })})`);
  await win.loadFile(html);
  await wait(`document.documentElement.dataset.ready === 'true'`);
  await type('reference', 'Jn 3:16-17');
  await evaluate(`${query('reference')}.focus()`);
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await wait(`${count(2)} && ${ready}`);
  await wait(`document.querySelectorAll('[data-testid="slide-row"] [data-slide-preview]').length === 2`);
  await type('slide-text', 'Texto muy largo que no cabe. '.repeat(150));
  await wait(`!${ready}`);
  await wait(`!!document.querySelector('[data-testid="slide-row"] [data-overflow="true"]')`);
  assert.notEqual(await evaluate(`getComputedStyle(${query('overflow-badge')}).display`), 'none');
  await click('reflow');
  await wait(`${count(2)} && ${ready} && !document.querySelector('[data-testid="slide-row"] [data-overflow="true"]')`);
  await click('merge');
  await wait(`${count(1)} && ${ready}`);
  await evaluate(`${query('slide-text')}.focus(); ${query('slide-text')}.setSelectionRange(70, 70)`);
  await click('split');
  await wait(`${count(2)} && ${ready}`);
  await click('reflow');
  await wait(`${count(2)} && ${ready}`);

  // Create after subscriptions: only watchDir can cause this card to appear.
  const template = path.join(templates, 'Plantilla de prueba.pro');
  await buildPro({ name: 'Plantilla de prueba', slides: [{ label: 'Diseño', text: 'Plantilla sincronizada' }], outPath: template });
  const root = await protobuf.load(path.join(PROTO_DIR, 'presentation.proto'));
  const typePro = root.lookupType('rv.data.Presentation');
  const source = typePro.decode(readFileSync(template)) as protobuf.ReflectedMessage;
  const base = source.cues[0].actions[0].slide.presentation.baseSlide;
  base.backgroundColor = { red: 0.1, green: 0.2, blue: 0.4, alpha: 1 };
  const verseElement = base.elements[0];
  base.elements.push({ ...verseElement, element: { ...verseElement.element, uuid: { string: randomUUID() }, name: 'Referencia',
    bounds: { origin: { x: 192, y: 900 }, size: { width: 1536, height: 90 } },
    text: { ...verseElement.element.text, attributes: { ...verseElement.element.text.attributes, font: { name: 'HelveticaNeue', family: 'Helvetica Neue', size: 42 } } },
  } });
  writeFileSync(template, typePro.encode(source).finish());
  await wait(`!!${query('template-card')}`);
  await click('template-card');
  await wait(`${query('template-card')}.getAttribute('aria-pressed') === 'true' && ${ready}`);
  const prepared = path.join(dataPath('out'), 'Juan 3.16-17 (PRUEBA).pro');
  await wait(`document.querySelector('[data-testid="slide-row"] [data-role="reference"]')?.textContent === 'Juan 3:16 PRUEBA'`);
  assert.equal((await readSlideModel(prepared)).elements.find(e => e.role === 'reference')?.text?.content, 'Juan 3:16 PRUEBA');
  assert.equal((await readSlideModel(prepared)).background, (await readSlideModel(template)).background, 'No clonó la plantilla seleccionada');
  assert.equal((await evaluate('window.pphelper.getConfig()')).lastTemplate, 'Plantilla de prueba');
  const readDirectory = fsPromises.readdir;
  let templateReads = 0;
  fsPromises.readdir = new Proxy(readDirectory, { apply(target, receiver, args) {
    if (args[0] === templates) templateReads++;
    return Reflect.apply(target, receiver, args);
  } });
  try {
    for (let i = 0; i < 20; i++) {
      const model = await evaluate(`window.pphelper.slideModel(${JSON.stringify(template)}, { text: 'Vista ${i}', reference: 'Juan 3:16' })`);
      assert.equal(model.elements.find((e: { role?: string }) => e.role === 'verse').text.content, `Vista ${i}`);
    }
    assert.equal(templateReads, 0, 'Las vistas previas no deben volver a leer la carpeta de plantillas');
  } finally { fsPromises.readdir = readDirectory; }
  await type('slide-text', 'Edición manual que se debe conservar.');
  await wait(ready);
  await click('no-template');
  await wait(`${query('no-template')}.getAttribute('aria-pressed') === 'true' && ${ready}`);
  assert.equal(await evaluate(`${query('slide-text')}.value`), 'Edición manual que se debe conservar.');
  assert(await evaluate(`!!document.querySelector('.edit-note')`));
  await click('reflow');
  await wait(`${ready} && ${query('slide-text')}.value.startsWith('Porque de tal')`);
  await type('max-chars', '90');
  await evaluate(`${query('max-chars')}.focus(); ${query('max-chars')}.blur()`);
  await wait(`document.querySelectorAll('[data-testid="slide-text"]').length >= 3 && ${ready}`);
  assert.equal((await evaluate('window.pphelper.getConfig()')).templateLimits[''].maxChars, 90);
  await click('template-card');
  await wait(`${count(2)} && ${ready}`);
  await click('send-library');
  await wait(`${query('status')}.textContent.includes('Enviado')`);
  const destination = path.join(library, path.basename(prepared));
  assert.equal(await readSlideCount(destination), 2);
  assert.equal((await readSlideModel(destination)).background, (await readSlideModel(template)).background);
  await type('slide-text', 'Texto sobrescrito para la biblioteca.');
  await wait(ready);
  await click('send-library');
  await wait(`${query('status')}.textContent.includes('Enviado')`);
  assert(readFileSync(destination).includes(Buffer.from('Texto sobrescrito')));
  await click('reflow');
  await wait(`${count(2)} && ${ready}`);
  await click('settings');
  await wait(`!!document.querySelector('[role="dialog"]')`);
  await click('close-settings');
  await wait(`!document.querySelector('[role="dialog"]')`);
  const csp = await evaluate(`document.querySelector('meta[http-equiv="Content-Security-Policy"]').content`);
  assert(!csp.includes('unsafe-') && csp.includes("connect-src 'none'"));
  const styles: string[] = await evaluate(`[...document.querySelectorAll('style')].map(s => s.textContent).filter(Boolean)`);
  for (const css of styles) assert(csp.includes(`'sha256-${createHash('sha256').update(css).digest('base64')}'`));
  await evaluate('document.fonts.ready');
  await evaluate('Promise.all(document.getAnimations().map(a => a.finished.catch(() => {})))');
  await evaluate(`document.activeElement.blur(); window.scrollTo(0, 0)`);
  await wait('scrollY === 0');
  await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const out = path.join(app.getAppPath(), 'scratch/out');
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'app-next.pro'), readFileSync(prepared));
  writeFileSync(path.join(out, 'app-next.png'), (await win.webContents.capturePage()).toPNG());
  win.setSize(420, 600);
  await wait(`innerWidth <= 420`);
  assert(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), 'Desbordamiento horizontal en ventana mínima');
  win.setSize(480, 820);
  await evaluate(`window.pphelper.setConfig(${JSON.stringify({ templateLibrary: library })})`);
  assert.deepEqual(await evaluate('window.pphelper.templates()'), [], 'Cambiar de biblioteca invalida la lista anterior');
  assert(await evaluate(`window.pphelper.slideModel(${JSON.stringify(template)}).then(() => false, () => true)`));
  await evaluate(`window.pphelper.setConfig(${JSON.stringify({ templateLibrary: templates })})`);
  assert.equal((await evaluate('window.pphelper.templates()')).length, 1);
  unlinkSync(template);
  await wait(`!${query('template-card')} && ${query('no-template')}.getAttribute('aria-pressed') === 'true' && ${ready}`);
  await type('reference', 'desconocido');
  await click('search');
  await wait(`${query('error')}.textContent.length > 0 && !${ready}`);
  // Offline XML and append: exercise the public bridge with no API key or network.
  const xml = dataPath('SpanishOfflineBible.xml');
  const lines = ['<bible translation="Biblia sintética de prueba" status="Texto sintético; libre para pruebas">', '<testament name="Old">'];
  for (let book = 1; book <= 27; book++) {
    lines.push(`<book number="${book}">`, '<chapter number="2">');
    for (let verse = 1; verse <= 260; verse++) lines.push(`<verse number="${verse}">${book === 1 && (verse === 2 || verse === 3) ? '' : 'Texto sintético para comprobar la importación sin conexión.'}</verse>`);
    lines.push('</chapter>', '</book>');
  }
  lines.push('</testament>', '</bible>');
  writeFileSync(xml, lines.join('\n'));
  const invalidXml = dataPath('Invalid.xml');
  writeFileSync(invalidXml, '<bible>');
  const showOpenDialog = dialog.showOpenDialog;
  const fetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls++; throw new Error('Smoke: lookup local intentó usar fetch'); };
  try {
    await evaluate(`window.pphelper.setConfig({ versions: { OFFLINE: 'smoke-bible' }, apiBibleKey: '' })`);
    dialog.showOpenDialog = new Proxy(showOpenDialog, { apply: async () => ({ canceled: false, filePaths: [xml, invalidXml] }) });
    const imported = await evaluate('window.pphelper.importBibles()');
    assert.equal(imported.imported.length, 1);
    assert.equal(imported.errors.length, 1);
    assert.equal(imported.errors[0].file, 'Invalid.xml');
    assert.equal((await evaluate('window.pphelper.getConfig()')).versions['OFFLINE 2'], 'local:offline');
    await evaluate(`window.pphelper.renameBible('offline', 'LOCAL')`);
    assert.equal((await evaluate('window.pphelper.getConfig()')).versions.LOCAL, 'local:offline');
    assert.equal((await evaluate('window.pphelper.getConfig()')).versions['OFFLINE 2'], undefined);
    await evaluate(`window.pphelper.setConfig({ versions: { LOCAL: 'local:offline' }, lastTemplate: '' })`);
    await win.loadFile(html);
    await wait(`document.documentElement.dataset.ready === 'true'`);
    assert(!await evaluate(`!!document.querySelector('[role="dialog"]')`), 'No debe forzar Ajustes con Biblia local sin API key');
    assert.match(await evaluate(`window.pphelper.lookup('Génesis 3', 'LOCAL', '').then(() => '', e => e.message)`), /No hay texto.*LOCAL.*archivo importado/);
    await type('reference', 'Génesis 2:2');
    await click('search');
    await wait(`${count(1)} && ${ready}`);
    assert.match(await evaluate(`document.querySelector('.slide-heading').textContent`), /Génesis 2:1-3/);
    // Re-create two-text template and prove the range also appears in the actual banner.
    writeFileSync(template, typePro.encode(source).finish());
    await wait(`!!${query('template-card')}`);
    await click('template-card');
    await wait(`${query('template-card')}.getAttribute('aria-pressed') === 'true' && ${ready}`);
    await wait(`document.querySelector('[data-testid="slide-row"] [data-role="reference"]')?.textContent === 'Génesis 2:1-3 LOCAL'`);
    const localOutput = path.join(dataPath('out'), 'Génesis 2.2 (LOCAL).pro');
    assert.equal(await readSlideCount(localOutput), 1);
    assert.equal((await readSlideModel(localOutput)).elements.find(e => e.role === 'reference')?.text?.content, 'Génesis 2:1-3 LOCAL');
    await click('settings');
    await wait(`!!${query('local-bible')}`);
    assert.match(await evaluate(`${query('local-bible')}.textContent`), /sin conexión.*7018 versículos.*agrupados.*libre para pruebas/);
    await evaluate('document.fonts.ready');
    await evaluate('Promise.all(document.getAnimations().map(a => a.finished.catch(() => {})))');
    writeFileSync(path.join(out, 'f16-settings.png'), (await win.webContents.capturePage()).toPNG());
    await click('close-settings');
    await wait(`!document.querySelector('[role="dialog"]')`);
    const before = readFileSync(destination);
    const cueType = root.lookupType('rv.data.Cue');
    const old = typePro.decode(before) as protobuf.ReflectedMessage;
    const oldCues = old.cues.map((cue: protobuf.ReflectedMessage) => cueType.encode(cue).finish());
    const targets = await evaluate('window.pphelper.proTargets()');
    assert(targets.targets.some((item: { path: string }) => item.path === destination));
    assert(!targets.targets.some((item: { path: string }) => item.path === template));
    assert(await evaluate(`window.pphelper.appendPro({ targetPath: ${JSON.stringify(template)}, slides: [{label: 'x', text: 'x'}], ref: 'Génesis 2:2', versionKey: 'LOCAL', template: '' }).then(() => false, () => true)`));
    await evaluate(`window.pphelper.setConfig({ lastTarget: ${JSON.stringify(destination)} })`);
    // Refresh config through Settings so the modal preselects the saved target.
    await win.loadFile(html);
    await wait(`document.documentElement.dataset.ready === 'true'`);
    await type('reference', 'Génesis 2:2');
    await click('search');
    await wait(`${count(1)} && ${ready}`);
    await click('open-append');
    await wait(`!!${query('confirm-append')} && !${query('confirm-append')}.disabled`);
    assert.match(await evaluate(`${query('append-target')}.textContent`), /Juan 3/);
    await evaluate('Promise.all(document.getAnimations().map(a => a.finished.catch(() => {})))');
    writeFileSync(path.join(out, 'f16-append.png'), (await win.webContents.capturePage()).toPNG());
    await click('confirm-append');
    await wait(`${query('status')}.textContent.includes('Añadidas 1 diapositivas') && !document.querySelector('[role="dialog"]')`);
    const after = typePro.decode(readFileSync(destination)) as protobuf.ReflectedMessage;
    assert.equal(after.cues.length, old.cues.length + 1);
    oldCues.forEach((bytes: Uint8Array, i: number) => assert.deepEqual(cueType.encode(after.cues[i]).finish(), bytes));
    const backups = await fsPromises.readdir(dataPath('backups'));
    assert.equal(backups.length, 1);
    assert.deepEqual(readFileSync(dataPath('backups', backups[0])), before);
    assert.equal((await evaluate('window.pphelper.getConfig()')).lastTarget, destination);
    assert.equal(fetchCalls, 0, 'Los flujos offline no deben usar fetch');
    const removed = await evaluate(`window.pphelper.removeBible('offline')`);
    assert(!Object.values(removed.versions).includes('local:offline'));
    assert.deepEqual(await evaluate('window.pphelper.localBibles()'), []);
  } finally { dialog.showOpenDialog = showOpenDialog; globalThis.fetch = fetch; }
  assert.deepEqual(errors, []);
  clearTimeout(timeout);
  console.log('OK smoke: React, sandbox/CSP, Enter, caché, previews, overflow, unión/división, reflow, límites, watcher crear/borrar, edición conservada, clonado, biblioteca/sobrescritura, ventana mínima, XML local sin red/API key, rangos, append con backup y capturas.');
  app.quit();
}
