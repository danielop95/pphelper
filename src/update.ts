import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
export const DOWNLOAD_PREFIX = 'https://github.com/danielop95/pphelper/releases/download/';
export interface UpdateAsset { version: string; url: string; size: number; sha256: string }

/** `.dmg` de la release para esta arquitectura; solo si viene de este repo y trae digest SHA-256. */
export function pickAsset(release: unknown, version: string, arch: string): UpdateAsset | undefined {
  const assets = (release as { assets?: unknown } | null)?.assets;
  if (!Array.isArray(assets)) return undefined;
  const asset = assets.find(item => item?.name === `pphelper-${version}-${arch}.dmg`);
  const sha256 = /^sha256:([0-9a-f]{64})$/.exec(String(asset?.digest ?? ''))?.[1];
  if (!asset || !sha256 || typeof asset.browser_download_url !== 'string' || !asset.browser_download_url.startsWith(DOWNLOAD_PREFIX)
    || !Number.isSafeInteger(asset.size) || asset.size <= 0) return undefined;
  return { version, url: asset.browser_download_url, size: asset.size, sha256 };
}

/** Descarga en streaming comprobando tamaño y SHA-256; si no coinciden, borra el archivo. */
export async function download(asset: UpdateAsset, file: string, progress: (fraction: number) => void, fetchImpl: typeof fetch = fetch): Promise<void> {
  const damaged = 'La actualización descargada está incompleta o dañada. Vuelve a intentarlo.';
  const hash = createHash('sha256');
  const handle = await open(file, 'w');
  let received = 0;
  try {
    const response = await fetchImpl(asset.url, { signal: AbortSignal.timeout(15 * 60_000) });
    if (!response.ok || !response.body) throw new Error(`No se pudo descargar la actualización (HTTP ${response.status}). Revisa la conexión.`);
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
      received += chunk.length;
      if (received > asset.size) throw new Error(damaged);
      hash.update(chunk);
      await handle.write(chunk);
      progress(received / asset.size);
    }
    if (received !== asset.size || hash.digest('hex') !== asset.sha256) throw new Error(damaged);
  } catch (error) {
    await handle.close(); await rm(file, { force: true });
    throw error;
  }
  await handle.close();
}

/**
 * Descarga, verifica y extrae la app nueva en `dir`. Devuelve la carpeta de trabajo y la
 * `.app` lista para el cambio; la cuarentena no aplica porque la descarga la hace la propia app.
 */
export async function prepareUpdate(asset: UpdateAsset, dir: string, progress: (fraction: number) => void, bundleId: string): Promise<{ work: string; next: string }> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const work = await mkdtemp(path.join(dir, 'v'));
  const dmg = path.join(work, 'update.dmg'), mount = path.join(work, 'mnt'), next = path.join(work, 'pphelper.app');
  try {
    await download(asset, dmg, progress);
    await mkdir(mount);
    await run('/usr/bin/hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount, dmg]);
    try { await run('/usr/bin/ditto', [path.join(mount, 'pphelper.app'), next]); }
    finally { await run('/usr/bin/hdiutil', ['detach', mount, '-force']).catch(() => { /* Se libera al reiniciar. */ }); }
    const plist = path.join(next, 'Contents/Info.plist');
    const value = async (key: string) => (await run('/usr/bin/plutil', ['-extract', key, 'raw', plist])).stdout.trim();
    if (await value('CFBundleIdentifier') !== bundleId || await value('CFBundleShortVersionString') !== asset.version) {
      throw new Error('La actualización descargada no corresponde a pphelper. Se canceló.');
    }
    return { work, next };
  } catch (error) {
    await rm(work, { recursive: true, force: true });
    throw error;
  } finally { await rm(dmg, { force: true }); }
}

/**
 * Se ejecuta con `/bin/sh -c SWAP_SCRIPT swap <pid> <app actual> <app nueva> <carpeta de trabajo> [abridor]`:
 * espera a que la app termine, cambia la .app (restaurando la anterior si falla) y la reabre.
 * Los valores llegan como argumentos posicionales, nunca interpolados.
 */
export const SWAP_SCRIPT = `
pid=$1; current=$2; next=$3; work=$4
while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done
if mv "$current" "$work/old.app"; then
  if ! mv "$next" "$current"; then mv "$work/old.app" "$current"; fi
fi
rm -rf "$work"
"\${5:-open}" "$current"
`;
