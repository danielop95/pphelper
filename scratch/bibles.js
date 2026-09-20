const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function listBibles(key = process.env.API_BIBLE_KEY, fetchImpl = fetch) {
  if (!key) {
    console.log('PENDIENTE: define API_BIBLE_KEY en el entorno y ejecuta node scratch/bibles.js; no guardes la clave en el repositorio.');
    return null;
  }
  const response = await fetchImpl('https://api.scripture.api.bible/v1/bibles?language=spa', {
    headers: { 'api-key': key }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`API.Bible devolvió HTTP ${response.status}; comprueba la clave y sus permisos`);
  const payload = await response.json();
  assert(Array.isArray(payload.data), 'Respuesta API.Bible sin lista data');
  for (const bible of payload.data) {
    assert(bible && typeof bible.id === 'string' && typeof bible.name === 'string'
      && typeof bible.abbreviation === 'string', 'Respuesta API.Bible con campos inválidos');
  }
  return payload;
}

async function main() {
  const payload = await listBibles();
  if (!payload) return;
  const out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'bibles-spa.json'), JSON.stringify(payload, null, 2) + '\n');
  const cell = value => String(value).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
  const table = ['| id | abreviatura | nombre |', '| --- | --- | --- |',
    ...payload.data.map(bible => `| ${cell(bible.id)} | ${cell(bible.abbreviation)} | ${cell(bible.name)} |`)].join('\n');
  const report = path.join(__dirname, 'SPIKE.md');
  if (fs.existsSync(report)) {
    const text = fs.readFileSync(report, 'utf8');
    assert(text.includes('<!-- API_BIBLE_START -->') && text.includes('<!-- API_BIBLE_END -->'), 'Faltan marcadores de API.Bible en SPIKE.md');
    const section = `<!-- API_BIBLE_START -->\nOK: consulta real ${new Date().toISOString()}; ${payload.data.length} Biblias devueltas para esta clave.\n\n${table}\n\nUna traducción ausente no está confirmada para esta cuenta.\n<!-- API_BIBLE_END -->`;
    fs.writeFileSync(report, text.replace(/<!-- API_BIBLE_START -->[\s\S]*?<!-- API_BIBLE_END -->/, () => section));
  }
  console.log(`OK: ${payload.data.length} Biblias; scratch/out/bibles-spa.json\n${table}`);
}

if (require.main === module) main().catch(error => { console.error(`FALLA: ${error.message}`); process.exitCode = 1; });
module.exports = { listBibles };
