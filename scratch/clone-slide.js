const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Presentation, root, slides, id, escapeRtf, decode } = require('./gen-pro');
const Cue = root.lookupType('rv.data.Cue');

function replaceRtf(bytes, text) {
  const rtf = Buffer.from(bytes).toString('latin1');
  assert.match(rtf, /^\{\\rtf[01]/, 'El elemento no contiene RTF reconocido');
  // ponytail: un único tramo uniforme; para estilos mixtos hace falta mapear runs.
  // Rechazar antes que reconstruir una fuente o perder formato silenciosamente.
  assert(!/\\uc(?!1\b)\d+/.test(rtf), 'Solo se admite el escape Unicode RTF uc1');
  const match = /^([\s\S]*?\\pard\b(?:\\[a-zA-Z]+-?\d* ?|[\r\n])*)([\s\S]*)(\}\s*)$/.exec(rtf);
  assert(match, 'RTF sin párrafo uniforme: adaptar el spike a esta referencia');
  assert.match(match[2], /^(?:[^\\{}]|\\[\\{}~_-]|\\'[a-fA-F0-9]{2}|\\u-?\d+\?|\\(?:par|line|tab) ?)*$/,
    'RTF con estilos mixtos o grupos en el texto: no se modificó la referencia');
  return Buffer.from(match[1] + escapeRtf(text) + match[3], 'latin1');
}

function slideAction(cue) {
  const actions = cue.actions.filter(action => action.slide?.presentation?.baseSlide);
  assert.equal(actions.length, 1, 'Se necesita una sola acción de slide por cue');
  return actions[0];
}

function textElement(cue, elementName) {
  const elements = slideAction(cue).slide.presentation.baseSlide.elements
    .filter(item => item.element?.text && (!elementName || item.element.name === elementName));
  assert.equal(elements.length, 1, 'Hay varios textos o ninguno: indicar el nombre exacto del elemento como cuarto argumento');
  return elements[0].element.text;
}

function cloneSlides(source, items, elementName) {
  assert.equal(source.cues.length, 1, 'Exporta una presentación con exactamente una slide');
  assert(Array.isArray(items) && items.length > 0, 'Se necesita al menos un texto');
  for (const item of items) {
    assert(item && typeof item.label === 'string' && typeof item.text === 'string', 'Cada entrada debe tener label y text de tipo string');
  }
  const original = source.cues[0];
  const originalText = textElement(original, elementName);
  const encoded = Cue.encode(original).finish();
  // Clonar vía protobuf, no JSON: protobufjs 8 conserva también campos desconocidos.
  const output = decode(Presentation, Presentation.encode(source).finish());
  output.uuid = id();
  output.cues = items.map(item => {
    const cue = decode(Cue, encoded);
    const action = slideAction(cue);
    const base = action.slide.presentation.baseSlide;
    const identities = [cue.uuid, ...cue.actions.map(value => value.uuid), base.uuid,
      ...base.elements.map(value => value.element?.uuid)].filter(Boolean);
    const replacements = new Map(identities.map(value => [value.string, id().string]));
    function remap(value) {
      if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return;
      if (replacements.has(value.string)) value.string = replacements.get(value.string);
      for (const child of Object.values(value)) remap(child);
    }
    remap(cue);
    action.label = action.label || {};
    action.label.text = item.label;
    textElement(cue, elementName).rtfData = replaceRtf(originalText.rtfData, item.text);
    return cue;
  });
  for (const group of output.cueGroups) {
    group.cueIdentifiers = group.cueIdentifiers.flatMap(value => value.string === original.uuid.string
      ? output.cues.map(cue => cue.uuid) : [value]);
  }
  if (!output.cueGroups.length) {
    output.cueGroups = [{ group: { uuid: id() }, cueIdentifiers: output.cues.map(cue => cue.uuid) }];
  }
  assert.equal(Presentation.verify(output), null);
  return output;
}

function main() {
  const reference = path.resolve(process.argv[2] || path.join(__dirname, 'reference.pro'));
  if (!fs.existsSync(reference)) {
    console.log(`PENDIENTE: exporta una presentación de una slide con el banner a ${reference}`);
    return;
  }
  // N es el número de entradas de este JSON; por defecto usa los dos versículos.
  const items = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : slides;
  const source = decode(Presentation, fs.readFileSync(reference));
  const result = cloneSlides(source, items, process.argv[4]);
  const out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, 'cloned.pro');
  fs.writeFileSync(file, Presentation.encode(result).finish());
  const decoded = decode(Presentation, fs.readFileSync(file));
  assert.equal(decoded.cues.length, items.length);
  assert.deepEqual(decoded.cues.map(cue => slideAction(cue).label.text), items.map(item => item.label));
  fs.writeFileSync(path.join(out, 'cloned-decoded.json'), JSON.stringify(Presentation.toObject(decoded, { bytes: String, longs: String, enums: String }), null, 2) + '\n');
  console.log(`OK estructural: ${file}; ${items.length} slides; validar el banner en ProPresenter`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(`FALLA: ${error.message}`); process.exitCode = 1; }
}
module.exports = { cloneSlides, replaceRtf, slideAction, textElement };
