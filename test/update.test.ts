import { strict as assert } from 'node:assert';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { DOWNLOAD_PREFIX, SWAP_SCRIPT, download, pickAsset } from '../src/update';

const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');

test('pickAsset elige el .dmg de la arquitectura y exige origen y digest', () => {
  const asset = (name: string, extra: object = {}) => ({ name, size: 10, browser_download_url: `${DOWNLOAD_PREFIX}v1.2.3/${name}`, digest: `sha256:${'a'.repeat(64)}`, ...extra });
  const release = { assets: [asset('pphelper-1.2.3-x64.dmg'), asset('pphelper-1.2.3-arm64.dmg')] };
  assert.deepEqual(pickAsset(release, '1.2.3', 'arm64'), { version: '1.2.3', url: `${DOWNLOAD_PREFIX}v1.2.3/pphelper-1.2.3-arm64.dmg`, size: 10, sha256: 'a'.repeat(64) });
  assert.equal(pickAsset(release, '1.2.4', 'arm64'), undefined);
  assert.equal(pickAsset({ assets: [asset('pphelper-1.2.3-arm64.dmg', { digest: undefined })] }, '1.2.3', 'arm64'), undefined);
  assert.equal(pickAsset({ assets: [asset('pphelper-1.2.3-arm64.dmg', { browser_download_url: 'https://evil.example/pphelper.dmg' })] }, '1.2.3', 'arm64'), undefined);
  assert.equal(pickAsset(null, '1.2.3', 'arm64'), undefined);
});

test('download verifica tamaño y SHA-256 y borra lo descargado si no coincide', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-download-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const data = Buffer.from('contenido sintético de la actualización');
  const fake = (async () => new Response(data)) as unknown as typeof fetch;
  const file = path.join(dir, 'update.dmg');
  const seen: number[] = [];
  await download({ version: '1', url: 'x', size: data.length, sha256: sha(data) }, file, fraction => seen.push(fraction), fake);
  assert.deepEqual(await readFile(file), data);
  assert.equal(seen.at(-1), 1);
  await assert.rejects(download({ version: '1', url: 'x', size: data.length, sha256: 'b'.repeat(64) }, file, () => {}, fake), /incompleta o dañada/);
  assert(!existsSync(file));
  await assert.rejects(download({ version: '1', url: 'x', size: 3, sha256: sha(data) }, file, () => {}, fake), /incompleta o dañada/);
  const failing = (async () => new Response('no', { status: 404 })) as unknown as typeof fetch;
  await assert.rejects(download({ version: '1', url: 'x', size: 2, sha256: sha(data) }, file, () => {}, failing), /HTTP 404/);
  assert(!existsSync(file));
});

test('SWAP_SCRIPT espera al proceso, cambia la app y restaura la anterior si falla', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-swap-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const swap = async (next: string) => {
    const current = path.join(dir, 'Apps', 'pphelper.app'), work = path.join(dir, 'work');
    await mkdir(current, { recursive: true }); await writeFile(path.join(current, 'version'), 'vieja');
    await mkdir(work, { recursive: true });
    const app = spawn('/bin/sleep', ['0.4']);
    const started = Date.now();
    await promisify(execFile)('/bin/sh', ['-c', SWAP_SCRIPT, 'swap', String(app.pid), current, next, work, '/usr/bin/true']);
    assert(Date.now() - started >= 300, 'Debe esperar a que la app termine');
    assert(!existsSync(work));
    return readFile(path.join(current, 'version'), 'utf8');
  };
  const next = path.join(dir, 'work', 'pphelper.app');
  await mkdir(next, { recursive: true }); await writeFile(path.join(next, 'version'), 'nueva');
  assert.equal(await swap(next), 'nueva');
  assert.equal(await swap(path.join(dir, 'no-existe.app')), 'vieja', 'Si falta la nueva, se restaura la anterior');
});
