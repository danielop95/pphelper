import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell, type IpcMainEvent, type IpcMainInvokeEvent, type NativeImage } from 'electron';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { openDb, importXml, listBibles, removeBible, renameBible, localVerses, type LocalBible } from './bibledb';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fetchVerses, formatRef, parseRef } from './bible';
import { mergeSlides, splitSlide, toSlides } from './split';
import { appendToPro, buildPro, readSlideModel, setProtoDir } from './pro';
import { listLibraries, listTemplates, watchDir } from './library';
import { runSmoke } from './smoke';
import { IPC, type Config, type Slide, type TextRoles, type Verse } from './types';

const EXTRA_IPC = { local: 'bibles:local', importBibles: 'bibles:import', removeBible: 'bibles:remove', renameBible: 'bibles:rename', targets: 'pro:targets', append: 'pro:append', library: 'pro:library', bibles: 'bibles:list', libraries: 'libraries:list', folder: 'library:choose', edit: 'slides:edit', dragError: 'pro:drag-error', update: 'app:update', openUpdate: 'app:open-update' } as const;
const RELEASES = 'https://github.com/danielop95/pphelper/releases';
let updateUrl = '';
function newer(latest: string, current: string): boolean {
  const a = latest.split('.').map(Number), b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
}
const smoke = process.argv.includes('--smoke');
const smokeDir = smoke ? mkdtempSync(path.join(tmpdir(), 'pphelper-smoke-')) : undefined;
if (smokeDir) app.setPath('userData', smokeDir);
if (!smoke && !app.requestSingleInstanceLock()) app.exit(0);
let window: BrowserWindow;
app.on('second-instance', () => { if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
let config: Config;
let db: ReturnType<typeof openDb>;
let importing = false;
const appending = new Set<string>();
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
  if (!Object.values(value.versions).every(id => /^(?:local:)?[\w-]+$/.test(id))) throw new Error('Identificador de Biblia inválido.');
  if (value.minChars !== undefined && (!Number.isSafeInteger(value.minChars) || value.minChars < 0 || value.minChars > value.maxChars)) throw new Error('El mínimo debe estar entre cero y el máximo.');
  if (value.templateLimits !== undefined && (!value.templateLimits || typeof value.templateLimits !== 'object' || Array.isArray(value.templateLimits) || !Object.entries(value.templateLimits).every(([name, limits]) => name.length <= 255 && limits && Number.isSafeInteger(limits.minChars) && Number.isSafeInteger(limits.maxChars) && limits.minChars >= 0 && limits.maxChars >= 1 && limits.maxChars <= 10000 && limits.minChars <= limits.maxChars))) throw new Error('Los límites de plantilla deben ser enteros: 0 ≤ mínimo ≤ máximo ≤ 10000.');
  if (value.templateRoles !== undefined && (!value.templateRoles || typeof value.templateRoles !== 'object' || Array.isArray(value.templateRoles) || !Object.entries(value.templateRoles).every(([name, roles]) => name.length <= 255 && roles && Number.isSafeInteger(roles.verse) && roles.verse >= 0 && (roles.reference === undefined || (Number.isSafeInteger(roles.reference) && roles.reference >= 0))))) throw new Error('Las cajas de versículo/cita elegidas para la plantilla son inválidas.');
  if (value.lastTarget !== undefined && (typeof value.lastTarget !== 'string' || (value.lastTarget !== '' && !path.isAbsolute(value.lastTarget)))) throw new Error('Presentación de destino inválida.');
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
function localVersions(id: string, abbreviation?: string): Record<string, string> {
  const value = `local:${id}`;
  const versions = Object.fromEntries(Object.entries(config.versions).filter(([, bible]) => bible !== value));
  if (abbreviation) {
    let key = abbreviation;
    for (let n = 2; Object.hasOwn(versions, key) && versions[key] !== value; n++) key = `${abbreviation} ${n}`;
    versions[key] = value;
  }
  return versions;
}
function localBible(id: string): LocalBible {
  if (importing) throw new Error('Espera a que termine la importación.');
  const bible = listBibles(db).find(item => item.id === id);
  if (typeof id !== 'string' || !bible) throw new Error('Biblia local no reconocida.');
  return bible;
}
async function proTargets(): Promise<import('./types').LibraryItem[]> {
  const libraries = smoke ? [] : await listLibraries();
  if (config.libraryPath && !libraries.some(item => item.path === config.libraryPath)) libraries.push({ name: path.basename(config.libraryPath), path: config.libraryPath });
  const excluded = config.templateLibrary && existsSync(config.templateLibrary) ? realpathSync(config.templateLibrary) : '';
  return libraries.flatMap(library => {
    if (!existsSync(library.path) || realpathSync(library.path) === excluded) return [];
    return readdirSync(library.path, { withFileTypes: true }).filter(entry => entry.isFile() && /\.pro$/i.test(entry.name))
      .map(entry => ({ name: path.basename(entry.name, path.extname(entry.name)), path: path.join(library.path, entry.name), library: library.name }));
  }).sort((a, b) => a.library.localeCompare(b.library) || a.name.localeCompare(b.name));
}
function proPresenterRunning(): Promise<boolean> {
  return new Promise(resolve => execFile('pgrep', ['-x', 'ProPresenter'], error => resolve(!error)));
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
  db = openDb(dataPath('bibles.db'));
  const libraries = smoke ? [] : await listLibraries();
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
    if (!partial || typeof partial !== 'object' || Array.isArray(partial) || Object.keys(partial).some(k => !['apiBibleKey', 'versions', 'minChars', 'maxChars', 'libraryPath', 'templateLibrary', 'templateLimits', 'templateRoles', 'lastTemplate', 'lastTarget'].includes(k))) throw new Error('Ajuste no admitido.');
    try { const saved = saveConfig({ ...config, ...partial }); configError = ''; return saved; }
    catch (error) { throw new Error(spanishError(error)); }
  });
  ipcMain.handle(EXTRA_IPC.local, event => { checkSender(event); if (importing) throw new Error('Espera a que termine la importación.'); return listBibles(db); });
  ipcMain.handle(EXTRA_IPC.importBibles, async event => {
    checkSender(event);
    if (importing) throw new Error('Ya hay una importación en curso.');
    importing = true;
    const imported: LocalBible[] = [], errors: { file: string; message: string }[] = [];
    try {
      const result = await dialog.showOpenDialog(window, { title: 'Importar Biblias XML', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Biblia XML', extensions: ['xml'] }] });
      if (!result.canceled) for (const file of result.filePaths) {
        try {
          const bible = await importXml(db, file);
          saveConfig({ ...config, versions: localVersions(bible.id, bible.abbreviation) });
          imported.push(bible);
        } catch (error) { errors.push({ file: path.basename(file), message: spanishError(error) }); }
      }
      return { imported, errors };
    } finally { importing = false; }
  });
  ipcMain.handle(EXTRA_IPC.removeBible, (event, id: string) => {
    checkSender(event); localBible(id);
    try { removeBible(db, id); return saveConfig({ ...config, versions: localVersions(id) }); }
    catch (error) { throw new Error(spanishError(error)); }
  });
  ipcMain.handle(EXTRA_IPC.renameBible, (event, id: string, abbreviation: string) => {
    checkSender(event); localBible(id);
    if (typeof abbreviation !== 'string') throw new Error('Abreviatura inválida.');
    try { renameBible(db, id, abbreviation); return saveConfig({ ...config, versions: localVersions(id, abbreviation.trim()) }); }
    catch (error) { throw new Error(spanishError(error)); }
  });
  ipcMain.handle(EXTRA_IPC.targets, async event => {
    checkSender(event);
    try { return { targets: await proTargets(), proPresenterRunning: await proPresenterRunning() }; }
    catch (error) { throw new Error(spanishError(error)); }
  });
  ipcMain.handle(EXTRA_IPC.append, async (event, input: Parameters<import('./types').PPHelperAPI['appendPro']>[0]) => {
    checkSender(event);
    if (!input || typeof input.targetPath !== 'string' || !(await proTargets()).some(item => item.path === input.targetPath)) throw new Error('Presentación de destino no reconocida.');
    const target = realpathSync(input.targetPath);
    if (appending.has(target)) throw new Error('Ya se está añadiendo a esta presentación.');
    appending.add(target);
    try {
      validSlides(input.slides);
      if (input.slides.some(slide => !slide.text.trim())) throw new Error('Cada diapositiva debe contener texto.');
      if (typeof input.versionKey !== 'string' || !Object.hasOwn(config.versions, input.versionKey)) throw new Error('Selecciona una versión válida.');
      if (typeof input.ref !== 'string' || input.ref.length > 200) throw new Error('Referencia inválida.');
      const parsed = parseRef(input.ref);
      const result = await appendToPro({ targetPath: target, slides: input.slides, group: `${parsed.bookName} ${parsed.chapter}`,
        versionKey: input.versionKey, templatePath: await templatePath(input.template), roles: config.templateRoles?.[input.template], backupDir: dataPath('backups') });
      saveConfig({ ...config, lastTarget: input.targetPath });
      return { ...result, proPresenterRunning: await proPresenterRunning() };
    } catch (error) { throw new Error(spanishError(error)); }
    finally { appending.delete(target); }
  });
  ipcMain.handle(IPC.lookup, async (event, ref: string, versionKey: string, template = '') => {
    checkSender(event);
    const request = ++lookupGeneration;
    lastLookup = undefined;
    try {
      if (typeof ref !== 'string' || ref.length > 200) throw new Error('Referencia no reconocida. Usa «Juan 3:16-18».');
      const parsed = parseRef(ref);
      if (typeof versionKey !== 'string' || !Object.hasOwn(config.versions, versionKey)) throw new Error('Selecciona una Biblia en Ajustes: importa un XML o carga las versiones de API.Bible.');
      const bibleId = config.versions[versionKey];
      if (importing && bibleId.startsWith('local:')) throw new Error('Espera a que termine la importación.');
      const verses = bibleId.startsWith('local:') ? localVerses(db, bibleId.slice(6), parsed)
        : await fetchVerses(parsed, bibleId, config.apiBibleKey, dataPath('bibles'));
      if (!verses.length) throw new Error(bibleId.startsWith('local:')
        ? `No hay texto para esa referencia en ${versionKey}; el archivo importado no la contiene.`
        : 'No se encontraron versículos para esa referencia.');
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
  ipcMain.handle(IPC.slideModel, async (event, file: string, slide?: { text: string; reference: string }, roles?: TextRoles) => {
    checkSender(event);
    if (typeof file !== 'string' || !(await templates()).some(item => item.path === file)) throw new Error('Plantilla no reconocida.');
    if (slide && (typeof slide.text !== 'string' || typeof slide.reference !== 'string' || slide.text.length > 100000 || slide.reference.length > 700)) throw new Error('Texto de vista previa inválido.');
    if (roles !== undefined && (!roles || !Number.isSafeInteger(roles.verse) || roles.verse < 0 || (roles.reference !== undefined && (!Number.isSafeInteger(roles.reference) || roles.reference < 0)))) throw new Error('Selección de caja inválida.');
    try { return await readSlideModel(file, slide, roles); } catch (error) { throw new Error(spanishError(error)); }
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
        slides: input.slides, templatePath: selectedTemplate, roles: config.templateRoles?.[input.template], outPath: temporary });
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
  ipcMain.handle(EXTRA_IPC.update, async event => {
    checkSender(event);
    if (smoke) return null;
    // ponytail: sin firma no hay auto-instalación; solo se avisa y se abre la release.
    try {
      const response = await fetch('https://api.github.com/repos/danielop95/pphelper/releases/latest', { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) return null;
      const release = await response.json() as { tag_name?: string; html_url?: string };
      const version = String(release.tag_name || '').replace(/^v/, '');
      if (!/^\d+\.\d+\.\d+$/.test(version) || !newer(version, app.getVersion())) return null;
      updateUrl = typeof release.html_url === 'string' && release.html_url.startsWith(`${RELEASES}/`) ? release.html_url : RELEASES;
      return { version };
    } catch { return null; }
  });
  ipcMain.handle(EXTRA_IPC.openUpdate, event => {
    checkSender(event);
    if (updateUrl) void shell.openExternal(updateUrl);
  });
  if (smoke) await runSmoke(window, dataPath);
  else await window.loadFile(path.join(app.getAppPath(), 'dist/renderer/index.html'));

}).catch(error => { console.error(spanishError(error)); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { stopWatching(); db?.close(); if (smokeDir) rmSync(smokeDir, { recursive: true, force: true }); });
