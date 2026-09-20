const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const protobuf = require('protobufjs');
const { Presentation, root, slides, buildPresentation, escapeRtf, decode } = require('./gen-pro');
const { cloneSlides, replaceRtf, slideAction, textElement } = require('./clone-slide');
const { listBibles } = require('./bibles');

async function check() {
  assert.equal(escapeRtf('á{\\}\n😀'), '\\u225?\\{\\\\\\}\\line \\u-10179?\\u-8704?');
  const source = buildPresentation([slides[0]]);
  const cue = source.cues[0];
  const unknown = protobuf.Writer.create().uint32(999 * 8 + 2).string('campo futuro').finish();
  cue.$unknowns = [unknown];
  const originalBytes = Presentation.encode(source).finish();
  const result = cloneSlides(source, slides);
  assert.deepEqual(Presentation.encode(source).finish(), originalBytes, 'La referencia no se modifica');
  const decoded = decode(Presentation, Presentation.encode(result).finish());
  assert.equal(decoded.cues.length, 2);
  assert.notEqual(decoded.cues[0].uuid.string, decoded.cues[1].uuid.string);
  assert.deepEqual(decoded.cueGroups[0].cueIdentifiers.map(value => value.string), decoded.cues.map(value => value.uuid.string));
  const Cue = root.lookupType('rv.data.Cue');
  for (const [index, cloned] of decoded.cues.entries()) {
    assert.equal(slideAction(cloned).label.text, slides[index].label);
    assert.deepEqual(cloned.$unknowns, [unknown], 'Conserva campos desconocidos');
    assert(textElement(cloned).rtfData.toString().includes(escapeRtf(slides[index].text)));
    // Tras deshacer solo IDs, label y texto, el cue completo debe ser idéntico.
    const before = [cue.uuid, cue.actions[0].uuid, slideAction(cue).slide.presentation.baseSlide.uuid,
      slideAction(cue).slide.presentation.baseSlide.elements[0].element.uuid];
    const after = [cloned.uuid, cloned.actions[0].uuid, slideAction(cloned).slide.presentation.baseSlide.uuid,
      slideAction(cloned).slide.presentation.baseSlide.elements[0].element.uuid];
    after.forEach((value, i) => { value.string = before[i].string; });
    slideAction(cloned).label.text = slideAction(cue).label.text;
    textElement(cloned).rtfData = textElement(cue).rtfData;
    assert.deepEqual(Cue.encode(cloned).finish(), Cue.encode(cue).finish(), 'Todo el estilo, fondo, posición y datos restantes se conservan');
  }
  assert.throws(() => replaceRtf(Buffer.from('{\\rtf1\\pard\\f0 hola \\b mundo}'), 'nuevo'), /estilos mixtos/);
  assert.throws(() => cloneSlides(buildPresentation(), slides), /exactamente una/);
  assert.throws(() => cloneSlides(source, [{ label: 'x' }]), /label y text/);
  const secondText = structuredClone(slideAction(source.cues[0]).slide.presentation.baseSlide.elements[0]);
  secondText.element.name = 'Segundo';
  slideAction(source.cues[0]).slide.presentation.baseSlide.elements.push(secondText);
  assert.throws(() => cloneSlides(source, slides), /varios textos/);
  assert.equal(cloneSlides(source, slides, 'Versículo').cues.length, 2);

  let called = false;
  const empty = await listBibles('', async () => { called = true; });
  assert.equal(empty, null);
  assert.equal(called, false);
  const payload = { data: [{ id: 'test', abbreviation: 'TEST', name: 'Biblia de prueba' }] };
  assert.deepEqual(await listBibles('test-key', async (url, options) => {
    assert.equal(url, 'https://api.scripture.api.bible/v1/bibles?language=spa');
    assert.equal(options.headers['api-key'], 'test-key');
    return { ok: true, json: async () => payload };
  }), payload);
  await assert.rejects(listBibles('test-key', async () => ({ ok: false, status: 401 })), /HTTP 401/);
  await assert.rejects(listBibles('test-key', async () => ({ ok: true, json: async () => ({}) })), /sin lista/);

  // Fixture sintético para probar también la CLI, distinto del banner del usuario.
  const out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'synthetic-reference.pro'), originalBytes);
  console.log('OK: generación, escapes RTF, clonación sin pérdida de estilo/datos, errores y contrato HTTP simulado.');
}

check().catch(error => { console.error(error); process.exitCode = 1; });
