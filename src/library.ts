import { execFile } from 'node:child_process';
import { watch } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { buildTemplate, localizeTemplate, readSlideCount } from './pro';
import type { LibraryItem, TemplateBox, TemplateDraft } from './types';

export async function listTemplates(dir: string): Promise<LibraryItem[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw new Error('No se pudo leer la carpeta de plantillas', { cause: error });
  });
  const items: LibraryItem[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.pro') continue;
    const file = path.join(dir, entry.name);
    try {
      if (await readSlideCount(file) === 1) {
        items.push({ name: path.basename(entry.name, path.extname(entry.name)), path: file, library: path.basename(dir) });
      }
    } catch { /* Una presentación ilegible no impide cargar las demás. */ }
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export function watchDir(dir: string, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const watcher = watch(dir, () => {
      clearTimeout(timer);
      timer = setTimeout(onChange, 300);
    });
    const close = () => { clearTimeout(timer); watcher.close(); };
    watcher.on('error', close);
    return close;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return () => {};
    throw new Error('No se pudo observar la carpeta de plantillas', { cause: error });
  }
}

export async function listLibraries(base = path.join(homedir(), 'Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces/ProPresenter/Libraries')): Promise<{ name: string; path: string }[]> {
  const entries = await readdir(base, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw new Error('No se pudieron leer las bibliotecas de ProPresenter', { cause: error });
  });
  return entries.filter(entry => entry.isDirectory())
    .map(entry => ({ name: entry.name, path: path.join(base, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const PROPRESENTER = path.join(homedir(), 'Library/Application Support/RenewedVision/ProPresenter');

/** Raíces ROOT_SHOW posibles: workspaces de ProPresenter 22+ y el workspace clásico. */
export async function proPresenterRoots(base = PROPRESENTER): Promise<string[]> {
  const modern = await readdir(path.join(base, 'Workspaces'), { withFileTypes: true }).catch(() => []);
  return [...modern.filter(entry => entry.isDirectory()).map(entry => path.join(base, 'Workspaces', entry.name)),
    path.join(base, 'UserWorkspaces/ProPresenter')];
}

export function templateName(file: string): string {
  const name = path.basename(file, path.extname(file)).replace(/[\\/:\x00-\x1f]/g, '-').trim().slice(0, 120);
  if (!name || name.startsWith('.')) throw new Error('Nombre de plantilla no válido.');
  return name;
}

/**
 * Escribe la plantilla `name` en `dir` reemplazando la anterior. `prepare` deja los medios en
 * `staged` y devuelve el .pro, que debe apuntar a `media` (su ubicación definitiva).
 */
async function writeTemplate(dir: string, name: string, prepare: (work: string, staged: string, media: string) => Promise<Uint8Array>): Promise<string> {
  await mkdir(path.join(dir, 'media'), { recursive: true });
  // Trabajo dentro de `dir`: rename entre volúmenes distintos fallaría (EXDEV).
  const work = await mkdtemp(path.join(dir, '.importing-'));
  try {
    const media = path.join(dir, 'media', name);
    const staged = path.join(work, 'media');
    const bytes = await prepare(work, staged, media);
    await rm(media, { recursive: true, force: true });
    await rename(staged, media).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    const temporary = path.join(dir, `.${name}.importing`);
    await writeFile(temporary, bytes);
    await rename(temporary, path.join(dir, `${name}.pro`));
    return name;
  } finally { await rm(work, { recursive: true, force: true }); }
}

/** Copia un .pro o .proBundle de una slide a `dir` (con sus medios en `dir/media/<nombre>`). Reemplaza la del mismo nombre. */
export async function importTemplate(source: string, dir: string, showRoots: string[]): Promise<string> {
  return writeTemplate(dir, templateName(source), async (work, staged, media) => {
    if (!/\.probundle$/i.test(source)) return localizeTemplate(source, staged, media, showRoots);
    const unpacked = path.join(work, 'bundle');
    try { await promisify(execFile)('/usr/bin/ditto', ['-x', '-k', source, unpacked]); }
    catch (error) { throw new Error('No se pudo abrir el paquete .proBundle.', { cause: error }); }
    const pros = (await readdir(unpacked)).filter(entry => /\.pro$/i.test(entry));
    if (pros.length !== 1) throw new Error(`El paquete debe contener 1 presentación y contiene ${pros.length}.`);
    return localizeTemplate(path.join(unpacked, pros[0]), staged, media, [unpacked, ...showRoots]);
  });
}

/** Crea una plantilla desde una imagen de banner y dos cajas de texto. */
export async function createTemplate(draft: TemplateDraft, image: { path: string; width: number; height: number }, dir: string): Promise<string> {
  const name = templateName(`${draft.name.trim()}.pro`);
  return writeTemplate(dir, name, async (_work, staged, media) => {
    const file = `1${path.extname(image.path).toLowerCase()}`;
    await mkdir(staged);
    await copyFile(image.path, path.join(staged, file));
    return buildTemplate({ name, image: { ...image, path: path.join(media, file) }, verse: draft.verse, reference: draft.reference });
  });
}

export async function removeTemplate(name: string, dir: string): Promise<void> {
  const safe = templateName(`${name}.pro`);
  await rm(path.join(dir, `${safe}.pro`), { force: true });
  await rm(path.join(dir, 'media', safe), { recursive: true, force: true });
}

/**
 * Propone cajas dentro de la banda horizontal opaca más alta de la imagen (BGRA, como
 * `nativeImage.toBitmap()`), en unidades de slide 1920×1080. Sin banda clara, usa toda la imagen.
 */
export function defaultBoxes(bitmap: Uint8Array, width: number, height: number): { verse: TemplateBox; reference: TemplateBox } {
  let band = { top: 0, bottom: height };
  let start = -1;
  for (let y = 0; y <= height; y++) {
    let opaque = 0;
    for (let x = 0; y < height && x < width; x++) if (bitmap[(y * width + x) * 4 + 3] > 200) opaque++;
    if (opaque > width / 2) { if (start < 0) start = y; continue; }
    if (start >= 0 && (y - start > band.bottom - band.top || band.bottom - band.top === height)) band = { top: start, bottom: y };
    start = -1;
  }
  const top = band.top * 1080 / height, size = (band.bottom - band.top) * 1080 / height;
  const font = { postscriptName: 'HelveticaNeue', family: 'Helvetica Neue', style: 'Regular' };
  const box = (y0: number, y1: number, x0: number, extra: Pick<TemplateBox, 'size' | 'align'>): TemplateBox =>
    ({ x: 1920 * x0, y: top + size * y0, width: 1920 * (0.92 - x0), height: size * (y1 - y0), font, color: '#ffffff', ...extra });
  return { verse: box(0.08, 0.75, 0.1, { size: 60, align: 'left' }), reference: box(0.78, 0.95, 0.5, { size: 36, align: 'right' }) };
}
