import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import * as protobuf from 'protobufjs';
import { buildPro, PROTO_DIR, readSlideCount, setProtoDir } from '../src/pro';

const slides = [
  { label: 'Juan 3:16', text: 'Porque Dios ama al mundo.' },
  { label: 'Juan 3:17', text: 'Salvación {eterna} \\ vida\r\n😀\tfin' },
];

function decode(type: protobuf.Type, bytes: Uint8Array): protobuf.ReflectedMessage {
  const reader = protobuf.Reader.create(bytes);
  reader.discardUnknown = false;
  return type.decode(reader);
}

test('genera dos slides con labels, RTF y estilo fijo', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-pro-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const outPath = path.join(dir, 'nueva', 'versos.pro');
  assert.equal(await buildPro({ name: 'Lectura', slides, outPath }), outPath);
  const root = await protobuf.load(path.join(PROTO_DIR, 'presentation.proto'));
  const presentation = decode(root.lookupType('rv.data.Presentation'), await readFile(outPath));
  assert.equal(presentation.name, 'Lectura');
  assert.equal(await readSlideCount(outPath), 2);
  assert.equal(presentation.cues.length, 2);
  for (const [index, cue] of presentation.cues.entries()) {
    const action = cue.actions[0];
    const base = action.slide.presentation.baseSlide;
    const text = base.elements[0].element.text;
    assert.equal(action.label.text, slides[index].label);
    assert.equal(base.size.width, 1920);
    assert.equal(base.size.height, 1080);
    assert.equal(text.attributes.font.size, 64);
    assert.equal(text.attributes.font.name, 'HelveticaNeue');
    assert.equal(text.attributes.textSolidFill.red, 1);
    assert.equal(text.attributes.paragraphStyle.alignment, 2);
    assert.equal(text.verticalAlignment, 1);
    assert.match(Buffer.from(text.rtfData).toString(), /\\qc\\f0\\fs128\\cf1 /);
  }
  const rtf = (index: number) => Buffer.from(presentation.cues[index].actions[0]
    .slide.presentation.baseSlide.elements[0].element.text.rtfData).toString();
  assert.ok(rtf(0).includes(slides[0].text));
  assert.ok(rtf(1).includes('Salvaci\\u243?n \\{eterna\\} \\\\ vida\\line \\u-10179?\\u-8704?\\tab fin'));
});

test('clona el texto de mayor área y conserva los demás campos y referencias', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-clone-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const templatePath = path.join(dir, 'plantilla.pro');
  const outPath = path.join(dir, 'clon.pro');
  await buildPro({ name: 'Plantilla', slides: [{ label: 'Origen', text: 'Árbol' }], outPath: templatePath });
  const root = await protobuf.load(path.join(PROTO_DIR, 'presentation.proto'));
  root.resolveAll();
  const Presentation = root.lookupType('rv.data.Presentation');
  const Cue = root.lookupType('rv.data.Cue');
  const source = decode(Presentation, await readFile(templatePath));
  const original = source.cues[0];
  const base = original.actions[0].slide.presentation.baseSlide;
  const small = decode(Cue, Cue.encode(original).finish()).actions[0]
    .slide.presentation.baseSlide.elements[0];
  small.element.uuid.string = 'SMALL-ELEMENT';
  small.element.bounds.size = { width: 100, height: 100 };
  base.elements.unshift(small);
  base.elementBuildOrder = base.elements.map((item: protobuf.ReflectedMessage) => item.element.uuid);
  original.completionActionUuid = original.actions[0].uuid;
  original.$unknowns = [protobuf.Writer.create().uint32(999 * 8 + 2).string('campo futuro').finish()];
  const originalBytes = Presentation.encode(source).finish();
  await writeFile(templatePath, originalBytes);
  assert.equal(await readSlideCount(templatePath), 1);
  await buildPro({ name: 'Clon', slides, templatePath, outPath });
  assert.deepEqual(await readFile(templatePath), Buffer.from(originalBytes));
  const output = decode(Presentation, await readFile(outPath));
  assert.equal(output.name, 'Clon');
  assert.notEqual(output.uuid.string, source.uuid.string);
  assert.equal(output.cues.length, 2);
  assert.notEqual(output.cues[0].uuid.string, output.cues[1].uuid.string);
  assert.deepEqual(output.cueGroups[0].cueIdentifiers.map((id: { string: string }) => id.string),
    output.cues.map((cue: protobuf.ReflectedMessage) => cue.uuid.string));
  function identities(cue: protobuf.ReflectedMessage): { string: string }[] {
    const slide = cue.actions[0].slide.presentation.baseSlide;
    return [cue.uuid, cue.actions[0].uuid, slide.uuid,
      ...slide.elements.map((item: protobuf.ReflectedMessage) => item.element.uuid)];
  }
  for (const [index, cue] of output.cues.entries()) {
    const slide = cue.actions[0].slide.presentation.baseSlide;
    assert.equal(cue.actions[0].label.text, slides[index].label);
    assert.deepEqual(cue.$unknowns, original.$unknowns);
    assert.deepEqual(slide.elements[0].element.text, base.elements[0].element.text);
    const rtf = Buffer.from(slide.elements[1].element.text.rtfData).toString();
    assert.ok(rtf.includes(index === 0 ? slides[0].text : 'Salvaci\\u243?n'));
    assert.ok(!rtf.includes('\\u193'), 'El acento inicial del texto original también se sustituye');
    assert.equal(cue.completionActionUuid.string, cue.actions[0].uuid.string);
    assert.deepEqual(slide.elementBuildOrder.map((id: { string: string }) => id.string),
      slide.elements.map((item: protobuf.ReflectedMessage) => item.element.uuid.string));
    const before = identities(original);
    const after = identities(cue);
    after.forEach((id, i) => assert.notEqual(id.string, before[i].string));
    const replacements = new Map(after.map((id, i) => [id.string, before[i].string]));
    function restore(value: unknown): void {
      if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return;
      const record = value as Record<string, unknown>;
      if (typeof record.string === 'string' && replacements.has(record.string)) {
        record.string = replacements.get(record.string);
      }
      Object.values(record).forEach(restore);
    }
    restore(cue);
    cue.actions[0].label.text = original.actions[0].label.text;
    slide.elements[1].element.text.rtfData = base.elements[1].element.text.rtfData;
    assert.deepEqual(Cue.encode(cue).finish(), Cue.encode(original).finish());
  }
});

test('rechaza plantillas con varias slides, RTF mixto y textos inválidos', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-invalid-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const templatePath = path.join(dir, 'plantilla.pro');
  const outPath = path.join(dir, 'salida.pro');
  await buildPro({ name: 'Plantilla', slides, outPath: templatePath });
  await assert.rejects(buildPro({ name: 'Clon', slides, templatePath, outPath }), /exactamente una slide/);
  const root = await protobuf.load(path.join(PROTO_DIR, 'presentation.proto'));
  const Presentation = root.lookupType('rv.data.Presentation');
  const source = decode(Presentation, await readFile(templatePath));
  source.cues = [source.cues[0]];
  for (const rtf of ['{\\rtf1\\pard\\f0 hola \\b mundo}', '{\\rtf1\\uc2\\pard hola}']) {
    source.cues[0].actions[0].slide.presentation.baseSlide.elements[0].element.text.rtfData = Buffer.from(rtf);
    await writeFile(templatePath, Presentation.encode(source).finish());
    await assert.rejects(buildPro({ name: 'Clon', slides, templatePath, outPath }), /estilos mixtos|uc1/);
  }
  await assert.rejects(buildPro({ name: 'Vacía', slides: [], outPath }), /al menos un texto/);
  await assert.rejects(buildPro({ name: 'Control', slides: [{ label: 'x', text: '\x00' }], outPath }), /control/);
});

test('permite configurar el directorio de protos', async () => {
  try {
    setProtoDir(path.join(PROTO_DIR, 'no-existe'));
    await assert.rejects(readSlideCount('no-existe.pro'), /no-existe.*presentation.proto/);
  } finally {
    setProtoDir(PROTO_DIR);
  }
});
