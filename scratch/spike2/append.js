// Código desechable: conserva cues/grupos existentes; estilo nuevo de buildPro.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { load, decode } = require('./proto');
const { buildPro } = require('../../dist/src/pro.js');
const library = path.join(process.env.HOME, 'Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces/ProPresenter/Libraries/Preestablecido');
const copy = path.join(library, 'SPIKE2 copia.pro');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function append(file, slides, group = 'Juan 3') {
  file = await fs.realpath(file);
  const scratch = await fs.realpath(__dirname);
  if (file !== copy && !file.startsWith(scratch + path.sep)) throw new Error('Solo se permite modificar SPIKE2 copia.pro o archivos dentro del spike');
  const root = await load();
  const P = root.lookupType('rv.data.Presentation');
  const C = root.lookupType('rv.data.Cue');
  const G = root.lookupType('rv.data.Presentation.CueGroup');
  const original = await fs.readFile(file);
  const source = decode(P, original);
  const cues = source.cues.map(c => Buffer.from(C.encode(c).finish()));
  const groups = source.cueGroups.map(g => Buffer.from(G.encode(g).finish()));
  const temp = path.join(__dirname, 'out', randomUUID() + '.pro');
  await fs.mkdir(path.dirname(temp), { recursive: true });
  try {
    await buildPro({ name: group, group, slides, outPath: temp });
    const added = decode(P, await fs.readFile(temp));
    source.cues.push(...added.cues);
    source.cueGroups.push(...added.cueGroups);
    const bytes = P.encode(source).finish();
    const result = decode(P, bytes);
    cues.forEach((c, i) => assert.deepEqual(Buffer.from(C.encode(result.cues[i]).finish()), c));
    groups.forEach((g, i) => assert.deepEqual(Buffer.from(G.encode(result.cueGroups[i]).finish()), g));
    assert.equal(result.cues.length, cues.length + slides.length);
    assert.equal(result.cueGroups.length, groups.length + 1);
    assert.deepEqual(result.cueGroups.at(-1).cueIdentifiers.map(x => x.string), result.cues.slice(cues.length).map(c => c.uuid.string));
    await fs.writeFile(temp, bytes);
    // Detecta cambios durante la lectura; no sustituye un bloqueo cooperativo de ProPresenter.
    assert.equal(hash(await fs.readFile(file)), hash(original), 'El archivo cambió durante el append');
    // rename es atómico; EXDEV falla sin reemplazar el destino si están en volúmenes distintos.
    await fs.rename(temp, file);
    assert.deepEqual(await fs.readFile(file), Buffer.from(bytes));
    return { file, before: cues.length, added: slides.length, after: result.cues.length,
      originalCueSha256: cues.map(hash), originalGroupSha256: groups.map(hash), byteIdentical: true };
  } finally { await fs.rm(temp, { force: true }); }
}
async function prepare() {
  const root = await load(), P = root.lookupType('rv.data.Presentation');
  const source = decode(P, await fs.readFile(path.join(library, 'MEnsaje.pro')));
  // Evita que dos presentaciones compartan identidad. No altera cues ni grupos.
  source.uuid = { string: randomUUID().toUpperCase() };
  source.name = 'SPIKE2 copia';
  await fs.writeFile(copy, P.encode(source).finish(), { flag: 'wx' });
  console.log('Copia preparada (sin slides añadidas):', copy);
}
module.exports = { append, prepare };
if (require.main === module) {
  (process.argv[2] === '--prepare' ? prepare() :
    fs.readFile(process.argv[3] || path.join(__dirname, 'slides.json'), 'utf8')
      .then(json => append(process.argv[2] || copy, JSON.parse(json), process.argv[4] || 'Juan 3'))
      .then(result => console.log(JSON.stringify(result, null, 2))))
    .catch(e => { console.error('FALLA:', e.message); process.exitCode = 1; });
}
