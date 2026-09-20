import { app, type BrowserWindow } from 'electron';
import { strict as assert } from 'node:assert';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
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
  unlinkSync(template);
  await wait(`!${query('template-card')} && ${query('no-template')}.getAttribute('aria-pressed') === 'true' && ${ready}`);
  await type('reference', 'desconocido');
  await click('search');
  await wait(`${query('error')}.textContent.length > 0 && !${ready}`);
  assert.deepEqual(errors, []);
  clearTimeout(timeout);
  console.log('OK smoke: React, sandbox/CSP, Enter, caché, previews, overflow, unión/división, reflow, límites, watcher crear/borrar, edición conservada, clonado, biblioteca/sobrescritura, ventana mínima y captura.');
  app.quit();
}
