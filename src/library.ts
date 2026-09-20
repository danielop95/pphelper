import { watch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { readSlideCount } from './pro';
import type { LibraryItem } from './types';

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
