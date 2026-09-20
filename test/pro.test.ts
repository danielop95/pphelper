import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import * as protobuf from 'protobufjs';
import { buildPro, PROTO_DIR, readSlideCount, readSlideModel, setProtoDir } from '../src/pro';

const slides = [
  { label: 'Juan 3:16', text: 'Porque Dios ama al mundo.' },
  { label: 'Juan 3:17', text: 'Salvación {eterna} \\ vida\r\n😀\tfin' },
];

function decode(type: protobuf.Type, bytes: Uint8Array): protobuf.ReflectedMessage {
  const reader = protobuf.Reader.create(bytes);
  reader.discardUnknown = false;
  return type.decode(reader);
}

test('clona RTF vacío desde attributes y conserva el estilo de MEnsaje', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-empty-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const templatePath = path.join(dir, 'plantilla.pro');
  const outPath = path.join(dir, 'clon.pro');
  const root = await protobuf.load(path.join(PROTO_DIR, 'presentation.proto'));
  const P = root.lookupType('rv.data.Presentation');
  await buildPro({ name: 'Vacía', slides: [slides[0]], outPath: templatePath });
  const synthetic = decode(P, await readFile(templatePath));
  const text = synthetic.cues[0].actions[0].slide.presentation.baseSlide.elements[0].element.text;
  text.rtfData = Buffer.from('{\\rtf1\\ansi\\ansicpg1252\\cocoartf2870\n\\cocoatextscaling0\\cocoaplatform0{\\fonttbl}{\\colortbl;\\red255\\green255\\blue255;}{\\*\\expandedcolortbl;;}}');
  text.attributes.font.size = 42;
  const fixtures = [Buffer.from(P.encode(synthetic).finish())];
  const real = path.join(homedir(), 'Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces/ProPresenter/Libraries/Preestablecido/MEnsaje.pro');
  if (existsSync(real)) fixtures.push(await readFile(real));
  const accented = [{ label: 'Salmo 23:1', text: 'El Señor es mi pastor.' }, { label: 'Salmo 23:2', text: 'Él me guía; salvación y paz.' }];
  for (const bytes of fixtures) {
    await writeFile(templatePath, bytes); // Siempre una copia temporal, nunca la biblioteca real.
    const source = decode(P, bytes);
    const before = source.cues[0].actions.find((a: protobuf.ReflectedMessage) => a.slide?.presentation?.baseSlide).slide.presentation.baseSlide;
    const preview = (await readSlideModel(templatePath)).elements.find(e => e.role === 'verse')!.text!;
    assert.equal(preview.content, '');
    assert.equal(preview.fontFamily, 'Helvetica Neue');
    assert.equal(preview.fontSize, 42);
    assert.equal(preview.align, 'center');
    assert.equal(preview.color, 'rgba(255,255,255,1)');
    await buildPro({ name: 'Clon vacío', slides: accented, templatePath, outPath });
    const output = decode(P, await readFile(outPath));
    assert.equal(output.cues.length, 2);
    const ids = new Set<string>();
    for (const [index, cue] of output.cues.entries()) {
      const action = cue.actions.find((a: protobuf.ReflectedMessage) => a.slide?.presentation?.baseSlide);
      const base = action.slide.presentation.baseSlide;
      assert.equal(action.label.text, accented[index].label);
      for (const uuid of [cue.uuid, action.uuid, base.uuid, ...base.elements.map((e: protobuf.ReflectedMessage) => e.element.uuid)]) {
        assert(!ids.has(uuid.string));
        ids.add(uuid.string);
      }
      assert.deepEqual(base.size, before.size);
      for (const [i, { element }] of base.elements.entries()) {
        const original = before.elements[i].element;
        if (element.text) {
          const rtf = Buffer.from(element.text.rtfData).toString('latin1');
          assert.match(rtf, /Helvetica ?Neue;/);
          assert.match(rtf, /\\fs84\b/);
          assert.match(rtf, /\\qc\b/);
          assert.match(rtf, /\\red255\\green255\\blue255/);
          assert.match(rtf, /\\u(?:241|201)\?/);
          if (process.platform === 'darwin') assert.equal(execFileSync('/usr/bin/textutil', ['-convert', 'txt', '-stdin', '-stdout', '-encoding', 'UTF-8'], { input: element.text.rtfData, encoding: 'utf8' }).replace(/\n$/, ''), accented[index].text);
          element.text.rtfData = original.text.rtfData;
        }
        element.uuid = original.uuid;
        assert.deepEqual(element, original, 'Conserva geometría, atributos y campos desconocidos');
      }
    }
    assert.deepEqual(await readFile(templatePath), bytes);
  }
  text.attributes.font.name = 'HelveticaNeue-BoldItalic';
  text.attributes.textSolidFill = { red: 0.2, green: 0.4, blue: 0.6, alpha: 1 };
  for (const [alignment, control] of ['ql', 'qr', 'qc', 'qj'].entries()) {
    text.attributes.paragraphStyle.alignment = alignment;
    await writeFile(templatePath, P.encode(synthetic).finish());
    await buildPro({ name: 'Estilo', slides: accented, templatePath, outPath });
    const rtf = Buffer.from(decode(P, await readFile(outPath)).cues[0].actions[0].slide.presentation.baseSlide.elements[0].element.text.rtfData).toString();
    assert(rtf.includes(`\\pard\\${control}\\f0\\fs84\\cf1\\b\\i `));
    assert(rtf.includes('\\red51\\green102\\blue153'));
    const preview = (await readSlideModel(templatePath)).elements[0].text!;
    assert(preview.bold && preview.italic);
  }
});

test('genera dos slides con labels, RTF y estilo fijo', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-pro-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const outPath = path.join(dir, 'nueva', 'versos.pro');
  const options = { name: 'Lectura', group: 'Juan 3', slides, outPath };
  assert.equal(await buildPro(options), outPath);
  const root = await protobuf.load(path.join(PROTO_DIR, 'presentation.proto'));
  const presentation = decode(root.lookupType('rv.data.Presentation'), await readFile(outPath));
  assert.equal(presentation.name, 'Lectura');
  assert.equal(presentation.cueGroups[0].group.name, 'Juan 3');
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
    assert.ok(Buffer.from(slide.elements[0].element.text.rtfData).toString().includes(slides[index].label));
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
    slide.elements[0].element.text.rtfData = base.elements[0].element.text.rtfData;
    slide.elements[1].element.text.rtfData = base.elements[1].element.text.rtfData;
    assert.deepEqual(Cue.encode(cue).finish(), Cue.encode(original).finish());
  }
});

test('la plantilla recibe referencia sin sufijos y versión en el texto menor', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-reference-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const templatePath = path.join(dir, 'plantilla.pro');
  const outPath = path.join(dir, 'salida.pro');
  await buildPro({ name: 'Plantilla', slides: slides.slice(0, 1), outPath: templatePath });
  const root = await protobuf.load(path.join(PROTO_DIR, 'presentation.proto'));
  const Presentation = root.lookupType('rv.data.Presentation');
  const source = decode(Presentation, await readFile(templatePath));
  const small = decode(Presentation, await readFile(templatePath)).cues[0].actions[0]
    .slide.presentation.baseSlide.elements[0];
  small.element.bounds.size = { width: 400, height: 80 };
  small.element.uuid.string = 'REFERENCE';
  source.cues[0].actions[0].slide.presentation.baseSlide.elements.push(small);
  const labels = ['Juan 3:16a-b', 'Juan 3:16a', 'Juan 3:16aa-ab', 'Juan 3:16a-17b'];
  const options = { name: 'Juan 3:16-17 (NTV)', group: 'Juan 3', versionKey: 'NTV',
    slides: labels.map(label => ({ label, text: 'Texto del versículo' })), templatePath, outPath };
  for (const groupName of ['Plantilla', '', 'Mi grupo']) {
    source.cueGroups[0].group.name = groupName;
    await writeFile(templatePath, Presentation.encode(source).finish());
    await buildPro(options);
    const output = decode(Presentation, await readFile(outPath));
    assert.equal(output.cueGroups[0].group.name, groupName === 'Mi grupo' ? 'Mi grupo' : 'Juan 3');
    for (const [index, cue] of output.cues.entries()) {
      const elements = cue.actions[0].slide.presentation.baseSlide.elements;
      assert.ok(Buffer.from(elements[0].element.text.rtfData).toString().includes('Texto del vers'));
      assert.ok(Buffer.from(elements[1].element.text.rtfData).toString()
        .endsWith(`${index === 3 ? 'Juan 3:16-17' : 'Juan 3:16'} NTV}`));
      assert.equal(cue.actions[0].label.text, labels[index]);
    }
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
  for (const rtf of ['{\\rtf1\\pard\\f0 hola \\b mundo}', '{\\rtf1\\uc2\\pard hola}', '{\\rtf1\\ansi hola}', '{\\rtf1\\ansi\\u193?}', '{\\rtf1\\ansi\\tab}']) {
    source.cues[0].actions[0].slide.presentation.baseSlide.elements[0].element.text.rtfData = Buffer.from(rtf);
    await writeFile(templatePath, Presentation.encode(source).finish());
    await assert.rejects(buildPro({ name: 'Clon', slides, templatePath, outPath }), /estilos mixtos|uc1|sin párrafo uniforme/);
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

test('lee el modelo de la primera slide con texto Unicode, geometría y estilo', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-model-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'modelo.pro');
  await buildPro({ name: 'Modelo', slides: [slides[1], slides[0]], outPath: file });
  assert.deepEqual(await readSlideModel(file), {
    width: 1920, height: 1080, background: 'rgba(0,0,0,1)',
    elements: [{
      x: 192, y: 270, width: 1536, height: 540, opacity: 1, role: 'verse',
      text: { content: slides[1].text.replace(/\r\n/g, '\n'), fontFamily: 'Helvetica Neue', fontSize: 64,
        color: 'rgba(255,255,255,1)', bold: false, italic: false, align: 'center', verticalAlign: 'middle' },
    }],
  });
});

test('asigna roles por área y sustituye el preview sin modificar la plantilla', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-model-roles-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'modelo.pro');
  await buildPro({ name: 'Modelo', slides: [slides[0]], outPath: file });
  const root = await protobuf.load(path.join(PROTO_DIR, 'presentation.proto'));
  const P = root.lookupType('rv.data.Presentation');
  const source = decode(P, await readFile(file));
  const base = source.cues[0].actions[0].slide.presentation.baseSlide;
  const small = decode(P, await readFile(file)).cues[0].actions[0].slide.presentation.baseSlide.elements[0];
  small.element.bounds.size = { width: 400, height: 80 };
  small.element.text.attributes.font = { name: 'HelveticaNeue-BoldItalic', size: 32 };
  base.elements.unshift(small);
  const bytes = Buffer.from(P.encode(source).finish());
  await writeFile(file, bytes);
  const original = await readSlideModel(file);
  assert.deepEqual(original.elements.map(e => e.role), ['reference', 'verse']);
  assert.equal(original.elements[0].text?.bold, true);
  assert.equal(original.elements[0].text?.italic, true);
  const model = await readSlideModel(file, { text: 'Nuevo texto', reference: 'Juan 3:16 NTV' });
  assert.deepEqual(model.elements.map(e => e.text?.content), ['Juan 3:16 NTV', 'Nuevo texto']);
  assert.deepEqual(await readFile(file), bytes);
  base.elements[0].element.bounds.size = base.elements[1].element.bounds.size;
  await writeFile(file, P.encode(source).finish());
  assert.deepEqual((await readSlideModel(file)).elements.map(e => e.role), ['verse', 'reference']);
});

test('porta rellenos activados, imágenes locales y marcas de elementos no soportados', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-model-fill-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'modelo.pro');
  const image = path.join(dir, 'imagen con espacio.png');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
  await writeFile(image, png);
  await buildPro({ name: 'Modelo', slides: [slides[0]], outPath: file });
  const root = await protobuf.load(path.join(PROTO_DIR, 'presentation.proto'));
  const P = root.lookupType('rv.data.Presentation');
  const source = decode(P, await readFile(file));
  const element = source.cues[0].actions[0].slide.presentation.baseSlide.elements[0].element;
  element.fill = { enable: false, color: { red: 1, alpha: 1 } };
  element.stroke = { enable: false, width: 3 };
  await writeFile(file, P.encode(source).finish());
  assert.equal((await readSlideModel(file)).elements[0].fill, undefined);
  assert.equal((await readSlideModel(file)).elements[0].unsupported, undefined);
  element.fill.enable = true;
  await writeFile(file, P.encode(source).finish());
  assert.equal((await readSlideModel(file)).elements[0].fill, 'rgba(255,0,0,1)');
  element.fill = { enable: true, media: { url: { absoluteString: pathToFileURL(image).href }, image: {} } };
  await writeFile(file, P.encode(source).finish());
  assert.equal((await readSlideModel(file)).elements[0].image, `data:image/png;base64,${png.toString('base64')}`);
  for (const unsupported of [
    { fill: { enable: true, gradient: {} } }, { path: { shape: { type: 2 } } },
    { stroke: { enable: true } }, { shadow: { enable: true } },
    { fill: { enable: true, media: { url: { absoluteString: 'file:///no-existe.png' }, image: {} } } },
  ]) {
    const candidate = decode(P, P.encode(source).finish());
    Object.assign(candidate.cues[0].actions[0].slide.presentation.baseSlide.elements[0].element, unsupported);
    await writeFile(file, P.encode(candidate).finish());
    const result = (await readSlideModel(file)).elements[0];
    assert.equal(result.unsupported, true);
    assert.equal(result.text?.content, slides[0].text);
  }
});

test('decodifica escapes RTF uniformes y usa textutil para estilos mixtos', { skip: process.platform !== 'darwin' }, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-model-rtf-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'modelo.pro');
  await buildPro({ name: 'Modelo', slides: [slides[0]], outPath: file });
  const root = await protobuf.load(path.join(PROTO_DIR, 'presentation.proto'));
  const P = root.lookupType('rv.data.Presentation');
  const source = decode(P, await readFile(file));
  const text = source.cues[0].actions[0].slide.presentation.baseSlide.elements[0].element.text;
  for (const [rtf, expected] of [
    ["{\\rtf1\\ansi\\ansicpg1252\\uc1\\pard Caf\\'e9\\~\\u193?rbol\\tab fin\\line otra\\par final}", 'Café\u00a0Árbol\tfin\notra\nfinal'],
    ['{\\rtf1\\ansi\\pard hola {\\b mundo} y {\\i texto}}', 'hola mundo y texto'],
  ]) {
    text.rtfData = Buffer.from(rtf, 'latin1');
    await writeFile(file, P.encode(source).finish());
    assert.equal((await readSlideModel(file)).elements[0].text?.content, expected);
  }
});

test('append conserva cues, grupos y campos desconocidos, respalda y clona la plantilla', async t => {
  const { appendToPro } = await import('../src/pro');
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-append-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const targetPath = path.join(dir, 'Destino.pro');
  const templatePath = path.join(dir, 'Plantilla.pro');
  await buildPro({ name: 'Destino', slides, outPath: targetPath });
  await buildPro({ name: 'Plantilla', slides: [slides[0]], outPath: templatePath });
  const root = await protobuf.load(path.join(PROTO_DIR, 'presentation.proto'));
  const P = root.lookupType('rv.data.Presentation'), C = root.lookupType('rv.data.Cue'), G = root.lookupType('rv.data.Presentation.CueGroup');
  const original = decode(P, await readFile(targetPath));
  for (const item of [original, original.cues[0], original.cueGroups[0]]) item.$unknowns = [protobuf.Writer.create().uint32(999 * 8 + 2).string('futuro').finish()];
  const bytes = Buffer.from(P.encode(original).finish());
  await writeFile(targetPath, bytes);
  const template = decode(P, await readFile(templatePath));
  template.cues[0].actions[0].slide.presentation.baseSlide.backgroundColor = { red: 0.25, alpha: 1 };
  await writeFile(templatePath, P.encode(template).finish());
  const result = await appendToPro({ targetPath, slides, group: 'Nuevo', templatePath, versionKey: 'LOCAL', backupDir: path.join(dir, 'backups') });
  assert.equal(result.added, 2);
  assert.deepEqual(await readFile(result.backup), bytes);
  assert.match(path.basename(result.backup), /^Destino-\d{8}-\d{6}(?:-\d+)?\.pro$/);
  const after = decode(P, await readFile(targetPath));
  assert.equal(after.cues.length, 4);
  assert.equal(after.cueGroups.length, 2);
  assert.deepEqual(after.$unknowns, original.$unknowns);
  original.cues.forEach((cue: protobuf.ReflectedMessage, i: number) => assert.deepEqual(C.encode(after.cues[i]).finish(), C.encode(cue).finish()));
  original.cueGroups.forEach((group: protobuf.ReflectedMessage, i: number) => assert.deepEqual(G.encode(after.cueGroups[i]).finish(), G.encode(group).finish()));
  assert.equal(after.cueGroups[1].group.name, 'Nuevo');
  assert.deepEqual(after.cueGroups[1].cueIdentifiers.map((id: { string: string }) => id.string), after.cues.slice(2).map((cue: protobuf.ReflectedMessage) => cue.uuid.string));
  assert.equal(after.cues[2].actions[0].slide.presentation.baseSlide.backgroundColor.red, template.cues[0].actions[0].slide.presentation.baseSlide.backgroundColor.red);
  const second = await appendToPro({ targetPath, slides: [slides[0]], group: 'Sin plantilla', backupDir: path.join(dir, 'backups') });
  assert.notEqual(second.backup, result.backup);
  assert.equal(await readSlideCount(targetPath), 5);
  assert.deepEqual(await readFile(result.backup), bytes);
});

test('append rechaza cambios concurrentes sin pisar el destino', async t => {
  const { appendToPro } = await import('../src/pro');
  const fs = await import('node:fs');
  const dir = await mkdtemp(path.join(tmpdir(), 'pphelper-conflict-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const targetPath = path.join(dir, 'Destino.pro');
  await buildPro({ name: 'Destino', slides, outPath: targetPath });
  const write = fs.promises.writeFile;
  t.mock.method(fs.promises, 'writeFile', async (...args: Parameters<typeof write>) => {
    await write(...args);
    if (String(args[0]).endsWith('.tmp')) await write(targetPath, 'Cambio externo');
  });
  await assert.rejects(appendToPro({ targetPath, slides, group: 'Nuevo', backupDir: path.join(dir, 'backups') }), /cambió/);
  assert.equal(await readFile(targetPath, 'utf8'), 'Cambio externo');
  assert(!(await fs.promises.readdir(dir)).some(name => name.endsWith('.tmp')));
});
