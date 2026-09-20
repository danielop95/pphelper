const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const protobuf = require('protobufjs');

const root = protobuf.loadSync(path.join(__dirname, '../proto/presentation.proto'));
root.resolveAll();
const Presentation = root.lookupType('rv.data.Presentation');
function decode(type, bytes) {
  const reader = protobuf.Reader.create(bytes);
  reader.discardUnknown = false;
  return type.decode(reader);
}
const id = () => ({ string: randomUUID().toUpperCase() });
const slides = [
  { label: 'Juan 3:16', text: 'Porque de tal manera amó Dios al mundo, que ha dado á su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.' },
  { label: 'Juan 3:17', text: 'Porque no envió Dios á su Hijo al mundo, para que condene al mundo, mas para que el mundo sea salvo por él.' },
]; // Texto de muestra: Reina-Valera 1909 (dominio público), no RVR1960.

function escapeRtf(text) {
  // Iterar unidades UTF-16 también cubre los pares sustitutos de emoji.
  return text.replace(/\r\n?/g, '\n').split('').map(char => {
    if ('\\{}'.includes(char)) return `\\${char}`;
    if (char === '\n') return '\\line ';
    if (char === '\t') return '\\tab ';
    const code = char.charCodeAt(0);
    if (code > 127) return `\\u${code > 32767 ? code - 65536 : code}?`;
    assert(code >= 32, 'Texto con caracteres de control no admitidos');
    return char;
  }).join('');
}

function buildPresentation(items = slides) {
  const white = { red: 1, green: 1, blue: 1, alpha: 1 };
  const font = { name: 'HelveticaNeue', family: 'Helvetica Neue', size: 64 };
  const cues = items.map(({ label, text }) => ({
    uuid: id(), name: label, isEnabled: true, completionActionType: 1,
    actions: [{
      uuid: id(), label: { text: label }, isEnabled: true, type: 11,
      slide: { presentation: { baseSlide: {
        uuid: id(), size: { width: 1920, height: 1080 },
        drawsBackgroundColor: true, backgroundColor: { alpha: 1 },
        elements: [{
          info: 3,
          element: {
            uuid: id(), name: 'Versículo', opacity: 1,
            bounds: { origin: { x: 192, y: 270 }, size: { width: 1536, height: 540 } },
            path: {
              closed: true, shape: { type: 1 },
              points: [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => ({
                point: { x, y }, q0: { x, y }, q1: { x, y },
              })),
            },
            text: {
              attributes: { font, textSolidFill: white, paragraphStyle: { alignment: 2, lineHeightMultiple: 1 } },
              verticalAlignment: 1,
              rtfData: Buffer.from('{\\rtf1\\ansi\\ansicpg1252\\uc1'
                + '{\\fonttbl{\\f0 HelveticaNeue;}}'
                + '{\\colortbl;\\red255\\green255\\blue255;}'
                + '\\pard\\qc\\f0\\fs128\\cf1 ' + escapeRtf(text) + '}'),
            },
          },
        }],
      } } },
    }],
  }));
  const data = {
    uuid: id(), name: 'Juan 3.16-17',
    applicationInfo: { platform: 1, application: 1, applicationVersion: { majorVersion: 7, minorVersion: 16, patchVersion: 2 } },
    background: { isEnabled: true, color: { alpha: 1 } },
    cueGroups: [{ group: { uuid: id(), name: 'Juan 3', color: white }, cueIdentifiers: cues.map(cue => cue.uuid) }],
    cues,
  };
  assert.equal(Presentation.verify(data), null);
  return Presentation.create(data);
}

function generate() {
  const out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, 'Juan 3.16-17.pro');
  fs.writeFileSync(file, Presentation.encode(buildPresentation()).finish());
  const decoded = decode(Presentation, fs.readFileSync(file));
  assert.equal(decoded.cues.length, 2);
  assert.deepEqual(decoded.cues.map(cue => cue.actions[0].label.text), slides.map(slide => slide.label));
  for (const cue of decoded.cues) {
    const elements = cue.actions[0].slide.presentation.baseSlide.elements;
    assert.equal(elements.length, 1);
    assert.match(elements[0].element.text.rtfData.toString(), /\\qc\\f0\\fs128\\cf1 /);
  }
  fs.writeFileSync(path.join(out, 'decoded.json'), JSON.stringify(Presentation.toObject(decoded, { bytes: String, longs: String, enums: String }), null, 2) + '\n');
  console.log(`OK: ${file}; 2 slides: ${slides.map(slide => slide.label).join(', ')}`);
}

if (require.main === module) generate();
module.exports = { Presentation, root, slides, id, escapeRtf, buildPresentation, decode };
