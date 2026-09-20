import { app, BrowserWindow, dialog, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type NativeImage } from 'electron';
import { constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import * as path from 'node:path';
import { fetchVerses, formatRef, parseRef } from './bible';
import { mergeSlides, splitSlide, toSlides } from './split';
import { buildPro, readSlideCount, setProtoDir } from './pro';
import { IPC, type Config, type Slide } from './types';

const EXTRA_IPC = { library: 'pro:library', bibles: 'bibles:list', template: 'template:add', folder: 'library:choose', edit: 'slides:edit', dragError: 'pro:drag-error' } as const;
const smoke = process.argv.includes('--smoke');
const smokeDir = smoke ? mkdtempSync(path.join(tmpdir(), 'pphelper-smoke-')) : undefined;
if (smokeDir) app.setPath('userData', smokeDir);
if (!smoke && !app.requestSingleInstanceLock()) app.exit(0);
let window: BrowserWindow;
app.on('second-instance', () => { if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
let config: Config;
let prepared: { file: string; icon: NativeImage; revision: number } | undefined;
let generation = 0;
const dataPath = (...parts: string[]): string => path.join(app.getPath('userData'), ...parts);

function checkSender(event: IpcMainEvent | IpcMainInvokeEvent): void {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Solicitud no autorizada.');
}
function validSlides(value: unknown): asserts value is Slide[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2000 || !value.every(s => s && typeof s.label === 'string' && typeof s.text === 'string' && s.label.length <= 500 && s.text.length <= 100000)) throw new Error('Las diapositivas contienen datos inválidos.');
}
function validateConfig(value: Config): void {
  if (typeof value.apiBibleKey !== 'string' || !Number.isSafeInteger(value.maxChars) || value.maxChars < 1 || value.maxChars > 10000) throw new Error('El límite de caracteres debe estar entre 1 y 10000.');
  for (const map of [value.versions, value.templates]) {
    if (!map || typeof map !== 'object' || Array.isArray(map) || !Object.entries(map).every(([k, v]) => k.length > 0 && k.length <= 120 && !/[\\/\x00-\x1f]/.test(k) && typeof v === 'string' && v.length > 0)) throw new Error('Versiones o plantillas inválidas.');
  }
  if (!Object.values(value.versions).every(id => /^[\w-]+$/.test(id))) throw new Error('Identificador de Biblia inválido.');
  if (value.libraryPath !== undefined && (typeof value.libraryPath !== 'string' || (value.libraryPath !== '' && !path.isAbsolute(value.libraryPath)))) throw new Error('Elige una ruta absoluta para la biblioteca.');
}
function saveConfig(next: Config): Config {
  validateConfig(next);
  writeFileSync(dataPath('config.json.tmp'), JSON.stringify(next, null, 2), { mode: 0o600 });
  renameSync(dataPath('config.json.tmp'), dataPath('config.json'));
  config = next;
  return config;
}
function spanishError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch failed|network|timeout|aborted/i.test(message)) return 'Sin conexión a API.Bible. Comprueba la red y vuelve a intentar; los capítulos guardados siguen disponibles.';
  if (/ENOENT/.test(message)) return 'No se encontró el archivo o la carpeta. Revisa la plantilla y la ruta de biblioteca.';
  if (/EACCES|EPERM/.test(message)) return 'No hay permisos para acceder al archivo o carpeta.';
  return message;
}

app.whenReady().then(async () => {
  if (app.isPackaged) setProtoDir(path.join(process.resourcesPath, 'proto'));
  for (const dir of ['', 'bibles', 'templates', 'out']) mkdirSync(dataPath(dir), { recursive: true });
  const libraries = path.join(homedir(), 'Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces/ProPresenter/Libraries');
  let libraryPath = '';
  if (existsSync(libraries)) {
    const first = readdirSync(libraries, { withFileTypes: true }).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))[0];
    if (first) libraryPath = path.join(libraries, first.name);
  }
  config = { apiBibleKey: '', maxChars: 180, versions: {}, templates: {}, libraryPath };
  let configError = '';
  try {
    if (existsSync(dataPath('config.json'))) {
      const saved = { ...config, ...JSON.parse(readFileSync(dataPath('config.json'), 'utf8')) } as Config;
      validateConfig(saved);
      config = saved;
    }
  } catch { configError = 'No se pudo leer config.json. Revisa los ajustes antes de guardarlos.'; }
  window = new BrowserWindow({
    width: 420, height: 700, minWidth: 360, minHeight: 480, alwaysOnTop: true, title: 'pphelper', backgroundColor: '#f6f5f2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false,
      additionalArguments: [`--pphelper-ipc=${JSON.stringify({ ...IPC, ...EXTRA_IPC })}`],
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ipcMain.handle(IPC.config, event => { checkSender(event); return { ...config, error: configError }; });
  ipcMain.handle(IPC.configSet, (event, partial: Partial<Config>) => {
    checkSender(event);
    if (!partial || typeof partial !== 'object' || Array.isArray(partial) || Object.keys(partial).some(k => !['apiBibleKey', 'versions', 'maxChars', 'libraryPath'].includes(k))) throw new Error('Ajuste no admitido.');
    try { const saved = saveConfig({ ...config, ...partial }); configError = ''; return saved; }
    catch (error) { throw new Error(spanishError(error)); }
  });
  ipcMain.handle(IPC.lookup, async (event, ref: string, versionKey: string) => {
    checkSender(event);
    try {
      if (typeof ref !== 'string' || ref.length > 200) throw new Error('Referencia no reconocida. Usa «Juan 3:16-18».');
      const parsed = parseRef(ref);
      if (typeof versionKey !== 'string' || !Object.hasOwn(config.versions, versionKey)) throw new Error('Selecciona una versión en Ajustes; necesitas una clave de API.Bible para cargar Biblias.');
      const verses = await fetchVerses(parsed, config.versions[versionKey], config.apiBibleKey, dataPath('bibles'));
      if (!verses.length) throw new Error('No se encontraron versículos para esa referencia.');
      return { ref: formatRef(parsed), slides: toSlides(verses, parsed.bookName, config.maxChars) };
    } catch (error) { throw new Error(spanishError(error)); }
  });
  ipcMain.handle(EXTRA_IPC.edit, (event, slides: Slide[], index: number, position?: number) => {
    checkSender(event); validSlides(slides);
    return position === undefined ? mergeSlides(slides, index) : splitSlide(slides, index, position);
  });
  ipcMain.handle(IPC.build, async (event, input: { ref: string; versionKey: string; template: string; slides: Slide[] }) => {
    checkSender(event);
    const revision = ++generation;
    prepared = undefined;
    const temporary = dataPath('out', `.building-${revision}.pro`);
    try {
      if (!input || typeof input.ref !== 'string' || typeof input.versionKey !== 'string' || !Object.hasOwn(config.versions, input.versionKey)) throw new Error('Selecciona una versión válida.');
      validSlides(input.slides);
      if (input.slides.some(s => !s.text.trim())) throw new Error('Cada diapositiva debe contener texto.');
      if (typeof input.template !== 'string' || (input.template && !Object.hasOwn(config.templates, input.template))) throw new Error('Plantilla no reconocida.');
      const parsed = parseRef(input.ref);
      const name = `${formatRef(parsed)} (${input.versionKey})`;
      const file = dataPath('out', `${name.replace(/:/g, '.')}.pro`);
      await buildPro({ name, group: `${parsed.bookName} ${parsed.chapter}`, versionKey: input.versionKey,
        slides: input.slides, templatePath: input.template ? config.templates[input.template] : undefined, outPath: temporary });
      const icon = await app.getFileIcon(temporary, { size: 'normal' });
      if (icon.isEmpty()) throw new Error('No se pudo obtener el icono para arrastrar el archivo.');
      if (revision !== generation) return null;
      renameSync(temporary, file);
      prepared = { file, icon, revision };
      return { name: path.basename(file), revision };
    } catch (error) { throw new Error(spanishError(error)); }
    finally { rmSync(temporary, { force: true }); }
  });
  ipcMain.on(IPC.dragOut, (event, revision: number) => {
    try {
      checkSender(event);
      if (!prepared || prepared.revision !== revision) throw new Error('Espera a que termine de generarse la presentación.');
      event.sender.startDrag({ file: prepared.file, icon: prepared.icon });
    } catch (error) { event.sender.send(EXTRA_IPC.dragError, spanishError(error)); }
  });
  ipcMain.handle(EXTRA_IPC.library, (event, revision: number) => {
    checkSender(event);
    if (!prepared || prepared.revision !== revision) throw new Error('Espera a que termine de generarse la presentación.');
    if (!config.libraryPath) throw new Error('Elige la carpeta de biblioteca en Ajustes.');
    try {
      if (!statSync(config.libraryPath).isDirectory()) throw new Error('La ruta de biblioteca debe ser una carpeta.');
      const target = path.join(config.libraryPath, path.basename(prepared.file));
      copyFileSync(prepared.file, target);
      return target;
    } catch (error) {
      throw new Error(spanishError(error));
    }
  });
  ipcMain.handle(EXTRA_IPC.folder, async event => {
    checkSender(event);
    const result = await dialog.showOpenDialog(window, { title: 'Elegir biblioteca de ProPresenter', properties: ['openDirectory'] });
    return result.canceled ? null : saveConfig({ ...config, libraryPath: result.filePaths[0] });
  });
  ipcMain.handle(EXTRA_IPC.template, async event => {
    checkSender(event);
    const result = await dialog.showOpenDialog(window, { title: 'Añadir plantilla de una diapositiva', filters: [{ name: 'ProPresenter', extensions: ['pro'] }], properties: ['openFile'] });
    if (result.canceled) return null;
    try {
      const source = result.filePaths[0];
      if (path.extname(source).toLowerCase() !== '.pro' || await readSlideCount(source) !== 1) throw new Error('La plantilla debe ser un archivo .pro con exactamente una diapositiva.');
      const base = path.basename(source, path.extname(source)).replace(/[\\/\x00-\x1f]/g, '_').slice(0, 100) || 'Plantilla';
      let name = base;
      for (let n = 2; existsSync(dataPath('templates', `${name}.pro`)); n++) name = `${base} ${n}`;
      const target = dataPath('templates', `${name}.pro`);
      copyFileSync(source, target, constants.COPYFILE_EXCL);
      return saveConfig({ ...config, templates: { ...config.templates, [name]: target } });
    } catch (error) { throw new Error(`No se pudo añadir la plantilla: ${spanishError(error)}`); }
  });
  ipcMain.handle(EXTRA_IPC.bibles, async event => {
    checkSender(event);
    if (!config.apiBibleKey.trim()) throw new Error('Falta la clave de API.Bible. Escríbela en Ajustes.');
    try {
      const response = await fetch('https://api.scripture.api.bible/v1/bibles?language=spa', { headers: { 'api-key': config.apiBibleKey }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`API.Bible devolvió HTTP ${response.status}; comprueba la clave y sus permisos.`);
      const payload = await response.json() as { data?: { id: string; abbreviation: string; name: string }[] };
      if (!Array.isArray(payload.data) || !payload.data.every(b => b && typeof b.id === 'string' && /^[\w-]+$/.test(b.id) && typeof b.abbreviation === 'string' && typeof b.name === 'string')) throw new Error('API.Bible devolvió una lista de Biblias inválida.');
      const used = new Set<string>();
      return payload.data.map(b => {
        const base = b.abbreviation.replace(/[\\/\x00-\x1f]/g, '-').slice(0, 80) || b.id;
        let key = base;
        for (let n = 2; used.has(key); n++) key = `${base} ${n}`;
        used.add(key);
        return { id: b.id, key, name: b.name };
      });
    } catch (error) { throw new Error(spanishError(error)); }
  });
  await window.loadFile(path.join(app.getAppPath(), 'src/renderer/index.html'));
  if (smoke) {
    // Runnable integration check: real sandbox, IPC, cached lookup, edits and generated protobuf.
    const cache = dataPath('bibles', 'smoke-bible', 'JHN');
    mkdirSync(cache, { recursive: true });
    writeFileSync(path.join(cache, '3.json'), JSON.stringify([
      { book: 'JHN', chapter: 3, verse: 16, text: 'Porque Dios ama al mundo y nos da vida.' },
      { book: 'JHN', chapter: 3, verse: 17, text: 'Para que el mundo sea salvo por él.' },
    ]));
    const library = dataPath('test-library');
    mkdirSync(library);
    const result = await window.webContents.executeJavaScript(`(async () => {
      const wait = async (test) => { for (let i = 0; i < 100; i++) { if (test()) return; await new Promise(r => setTimeout(r, 50)); } throw new Error('Smoke: espera agotada'); };
      const assert = (ok, message) => { if (!ok) throw new Error(message); };
      await wait(() => document.documentElement.dataset.ready === 'true');
      assert(typeof require === 'undefined' && !!window.pphelper, 'Sandbox o preload incorrecto');
      const missingKey = await window.pphelper.listBibles().then(() => '', e => e.message);
      assert(missingKey.includes('Falta la clave'), 'No detectó la falta de clave');
      await window.pphelper.setConfig({ versions: { PRUEBA: 'smoke-bible' }, libraryPath: ${JSON.stringify(library)} });
      await window.refreshConfig();
      document.querySelector('#reference').value = 'Jn 3:16-17';
      document.querySelector('#lookup-form').requestSubmit();
      await wait(() => document.querySelector('#drag-card').draggable);
      assert(document.querySelectorAll('#slides textarea').length === 2, 'Lookup no creó dos slides');
      const first = document.querySelector('#slides textarea');
      first.value += ' Texto editado.'; first.dispatchEvent(new Event('input', { bubbles: true }));
      assert(!document.querySelector('#drag-card').draggable, 'Se permitió arrastrar durante el debounce');
      await wait(() => document.querySelector('#drag-card').draggable);
      document.querySelector('[data-merge]').click();
      await wait(() => document.querySelectorAll('#slides textarea').length === 1 && document.querySelector('#drag-card').draggable);
      const area = document.querySelector('#slides textarea');
      area.focus(); area.setSelectionRange(20, 20);
      document.querySelector('[data-split]').click();
      await wait(() => document.querySelectorAll('#slides textarea').length === 2 && document.querySelector('#drag-card').draggable);
      document.querySelector('#send-library').click();
      await wait(() => document.querySelector('#status').textContent.includes('Enviado'));
      const second = document.querySelector('#slides textarea');
      second.value += ' Sobrescrito.'; second.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(() => document.querySelector('#drag-card').draggable);
      document.querySelector('#status').textContent = '';
      document.querySelector('#send-library').click();
      await wait(() => document.querySelector('#status').textContent.includes('Enviado'));
      assert(!document.querySelector('#error').textContent, 'Falló la sobrescritura');
      document.querySelector('#reference').value = 'desconocido';
      document.querySelector('#lookup-form').requestSubmit();
      await wait(() => !!document.querySelector('#error').textContent);
      assert(!document.querySelector('#drag-card').draggable, 'Un error dejó un archivo antiguo arrastrable');
      return true;
    })()`);
    const libraryFile = path.join(library, 'Juan 3.16-17 (PRUEBA).pro');
    if (!result || !window.isAlwaysOnTop() || await readSlideCount(libraryFile) !== 2
      || !readFileSync(libraryFile).includes(Buffer.from('Sobrescrito.'))) throw new Error('Smoke de ventana o archivo falló.');
    console.log('OK smoke: ventana visible, sandbox, IPC, caché, edición/debounce, unión, división, biblioteca con sobrescritura y .pro de 2 slides. Drop manual no probado.');
    app.quit();
  }
}).catch(error => { console.error(spanishError(error)); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { if (smokeDir) rmSync(smokeDir, { recursive: true, force: true }); });
