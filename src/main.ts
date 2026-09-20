import { app, BrowserWindow, dialog, ipcMain, nativeTheme, type IpcMainEvent, type IpcMainInvokeEvent, type NativeImage } from 'electron';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fetchVerses, formatRef, parseRef } from './bible';
import { mergeSlides, splitSlide, toSlides } from './split';
import { buildPro, readSlideModel, setProtoDir } from './pro';
import { listLibraries, listTemplates, watchDir } from './library';
import { runSmoke } from './smoke';
import { IPC, type Config, type Slide, type Verse } from './types';

const EXTRA_IPC = { library: 'pro:library', bibles: 'bibles:list', libraries: 'libraries:list', folder: 'library:choose', edit: 'slides:edit', dragError: 'pro:drag-error' } as const;
const smoke = process.argv.includes('--smoke');
const smokeDir = smoke ? mkdtempSync(path.join(tmpdir(), 'pphelper-smoke-')) : undefined;
if (smokeDir) app.setPath('userData', smokeDir);
if (!smoke && !app.requestSingleInstanceLock()) app.exit(0);
let window: BrowserWindow;
app.on('second-instance', () => { if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
let config: Config;
let prepared: { file: string; icon: NativeImage; revision: number } | undefined;
let generation = 0;
let lookupGeneration = 0;
let lastLookup: { verses: Verse[]; bookName: string; ref: string } | undefined;
let stopWatching = () => {};
let templateCache: ReturnType<typeof listTemplates> | undefined;
function templates(): ReturnType<typeof listTemplates> {
  if (!templateCache) {
    const pending = (config.templateLibrary ? listTemplates(config.templateLibrary) : Promise.resolve([])).catch(error => {
      if (templateCache === pending) templateCache = undefined;
      throw error;
    });
    templateCache = pending;
  }
  return templateCache;
}
function watchTemplates(): void {
  stopWatching();
  templateCache = undefined;
  stopWatching = config.templateLibrary ? watchDir(config.templateLibrary, () => {
    templateCache = undefined;
    generation++; prepared = undefined;
    if (!window.isDestroyed()) window.webContents.send(IPC.templatesChanged);
  }) : () => {};
}
async function templatePath(name: string): Promise<string | undefined> {
  if (typeof name !== 'string') throw new Error('Plantilla no reconocida.');
  if (!name) return undefined;
  const item = (await templates()).find(item => item.name === name);
  if (!item) throw new Error('La plantilla ya no está en la biblioteca. Elige otra plantilla.');
  return item.path;
}
function currentSlides(template: string): Slide[] {
  if (!lastLookup) throw new Error('Busca primero un pasaje para reorganizarlo.');
  return toSlides(lastLookup.verses, lastLookup.bookName,
    config.templateLimits?.[template] ?? { minChars: config.minChars ?? 80, maxChars: config.maxChars });
}
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
  if (value.minChars !== undefined && (!Number.isSafeInteger(value.minChars) || value.minChars < 0 || value.minChars > value.maxChars)) throw new Error('El mínimo debe estar entre cero y el máximo.');
  if (value.templateLimits !== undefined && (!value.templateLimits || typeof value.templateLimits !== 'object' || Array.isArray(value.templateLimits) || !Object.entries(value.templateLimits).every(([name, limits]) => name.length <= 255 && limits && Number.isSafeInteger(limits.minChars) && Number.isSafeInteger(limits.maxChars) && limits.minChars >= 0 && limits.maxChars >= 1 && limits.maxChars <= 10000 && limits.minChars <= limits.maxChars))) throw new Error('Los límites de plantilla deben ser enteros: 0 ≤ mínimo ≤ máximo ≤ 10000.');
  if (value.lastTemplate !== undefined && (typeof value.lastTemplate !== 'string' || value.lastTemplate.length > 255)) throw new Error('Plantilla no reconocida.');
  if (value.templateLibrary !== undefined && (typeof value.templateLibrary !== 'string' || (value.templateLibrary !== '' && !path.isAbsolute(value.templateLibrary)))) throw new Error('Elige una ruta absoluta para las plantillas.');
  if (value.libraryPath !== undefined && (typeof value.libraryPath !== 'string' || (value.libraryPath !== '' && !path.isAbsolute(value.libraryPath)))) throw new Error('Elige una ruta absoluta para la biblioteca.');
}
function saveConfig(next: Config): Config {
  validateConfig(next);
  writeFileSync(dataPath('config.json.tmp'), JSON.stringify(next, null, 2), { mode: 0o600 });
  renameSync(dataPath('config.json.tmp'), dataPath('config.json'));
  const changed = config.templateLibrary !== next.templateLibrary;
  config = next;
  if (changed) { watchTemplates(); window.webContents.send(IPC.templatesChanged); }
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
  nativeTheme.themeSource = 'dark';
  if (!app.isPackaged) app.dock?.setIcon(path.join(app.getAppPath(), 'build/icon.png'));
  if (app.isPackaged) setProtoDir(path.join(process.resourcesPath, 'proto'));
  for (const dir of ['', 'bibles', 'out']) mkdirSync(dataPath(dir), { recursive: true });
  const libraries = await listLibraries();
  config = { apiBibleKey: '', maxChars: 180, versions: {}, templates: {}, libraryPath: libraries[0]?.path || '' };
  let configError = '';
  try {
    if (existsSync(dataPath('config.json'))) {
      const saved = { ...config, ...JSON.parse(readFileSync(dataPath('config.json'), 'utf8')) } as Config;
      validateConfig(saved);
      config = saved;
    }
  } catch { configError = 'No se pudo leer config.json. Revisa los ajustes antes de guardarlos.'; }
  window = new BrowserWindow({
    width: 480, height: 820, minWidth: 420, minHeight: 600, alwaysOnTop: true, title: 'pphelper', backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false,
      additionalArguments: [`--pphelper-ipc=${JSON.stringify({ ...IPC, ...EXTRA_IPC })}`],
    },
  });
  watchTemplates();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ipcMain.handle(IPC.config, event => { checkSender(event); return { ...config, error: configError }; });
  ipcMain.handle(IPC.configSet, (event, partial: Partial<Config>) => {
    checkSender(event);
    if (!partial || typeof partial !== 'object' || Array.isArray(partial) || Object.keys(partial).some(k => !['apiBibleKey', 'versions', 'minChars', 'maxChars', 'libraryPath', 'templateLibrary', 'templateLimits', 'lastTemplate'].includes(k))) throw new Error('Ajuste no admitido.');
    try { const saved = saveConfig({ ...config, ...partial }); configError = ''; return saved; }
    catch (error) { throw new Error(spanishError(error)); }
  });
  ipcMain.handle(IPC.lookup, async (event, ref: string, versionKey: string, template = '') => {
    checkSender(event);
    const request = ++lookupGeneration;
    lastLookup = undefined;
    try {
      if (typeof ref !== 'string' || ref.length > 200) throw new Error('Referencia no reconocida. Usa «Juan 3:16-18».');
      const parsed = parseRef(ref);
      if (typeof versionKey !== 'string' || !Object.hasOwn(config.versions, versionKey)) throw new Error('Selecciona una versión en Ajustes; necesitas una clave de API.Bible para cargar Biblias.');
      const verses = await fetchVerses(parsed, config.versions[versionKey], config.apiBibleKey, dataPath('bibles'));
      if (!verses.length) throw new Error('No se encontraron versículos para esa referencia.');
      if (request !== lookupGeneration) throw new Error('Consulta reemplazada por una más reciente.');
      await templatePath(template);
      lastLookup = { verses, bookName: parsed.bookName, ref: formatRef(parsed) };
      return { ref: lastLookup.ref, slides: currentSlides(template) };
    } catch (error) { throw new Error(spanishError(error)); }
  });
  ipcMain.handle(IPC.reflow, async (event, template = '') => {
    checkSender(event); await templatePath(template);
    return currentSlides(template);
  });
  ipcMain.handle(IPC.templates, event => { checkSender(event); return templates(); });
  ipcMain.handle(EXTRA_IPC.libraries, event => { checkSender(event); return listLibraries(); });
  ipcMain.handle(IPC.slideModel, async (event, file: string, slide?: { text: string; reference: string }) => {
    checkSender(event);
    if (typeof file !== 'string' || !(await templates()).some(item => item.path === file)) throw new Error('Plantilla no reconocida.');
    if (slide && (typeof slide.text !== 'string' || typeof slide.reference !== 'string' || slide.text.length > 100000 || slide.reference.length > 700)) throw new Error('Texto de vista previa inválido.');
    try { return await readSlideModel(file, slide); } catch (error) { throw new Error(spanishError(error)); }
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
      const selectedTemplate = await templatePath(input.template);
      const parsed = parseRef(input.ref);
      const name = `${formatRef(parsed)} (${input.versionKey})`;
      const file = dataPath('out', `${name.replace(/:/g, '.')}.pro`);
      await buildPro({ name, group: `${parsed.bookName} ${parsed.chapter}`, versionKey: input.versionKey,
        slides: input.slides, templatePath: selectedTemplate, outPath: temporary });
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
  ipcMain.handle(EXTRA_IPC.folder, async (event, target: 'libraryPath' | 'templateLibrary' = 'libraryPath') => {
    checkSender(event);
    if (!['libraryPath', 'templateLibrary'].includes(target)) throw new Error('Carpeta no admitida.');
    const result = await dialog.showOpenDialog(window, { title: target === 'templateLibrary' ? 'Elegir biblioteca de plantillas' : 'Elegir biblioteca de ProPresenter', properties: ['openDirectory'] });
    return result.canceled ? null : saveConfig({ ...config, [target]: result.filePaths[0] });
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
  if (smoke) await runSmoke(window, dataPath);
  else await window.loadFile(path.join(app.getAppPath(), 'dist/renderer/index.html'));

}).catch(error => { console.error(spanishError(error)); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { stopWatching(); if (smokeDir) rmSync(smokeDir, { recursive: true, force: true }); });
