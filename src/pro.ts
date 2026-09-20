import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as protobuf from 'protobufjs';
import type { Slide } from './types';

export const PROTO_DIR = path.join(__dirname, '..', '..', 'proto');
let protoDir = PROTO_DIR;

export function setProtoDir(dir: string): void {
  protoDir = dir;
}

async function loadProtos(): Promise<protobuf.Root> {
  const root = await protobuf.load(path.join(protoDir, 'presentation.proto'));
  root.resolveAll();
  return root;
}

function decode(type: protobuf.Type, bytes: Uint8Array): protobuf.ReflectedMessage {
  const reader = protobuf.Reader.create(bytes);
  reader.discardUnknown = false;
  return type.decode(reader);
}

function id(): { string: string } {
  return { string: randomUUID().toUpperCase() };
}

function escapeRtf(text: string): string {
  // Unidades UTF-16: también conserva los pares sustitutos de emoji.
  return text.replace(/\r\n?/g, '\n').split('').map(char => {
    if ('\\{}'.includes(char)) return `\\${char}`;
    if (char === '\n') return '\\line ';
    if (char === '\t') return '\\tab ';
    const code = char.charCodeAt(0);
    if (code > 127) return `\\u${code > 32767 ? code - 65536 : code}?`;
    if (code < 32) throw new Error('Texto con caracteres de control no admitidos');
    return char;
  }).join('');
}

function replaceRtf(bytes: Uint8Array, text: string): Buffer {
  const rtf = Buffer.from(bytes).toString('latin1');
  if (!/^\{\\rtf[01]/.test(rtf)) throw new Error('El elemento no contiene RTF reconocido');
  // ponytail: un único tramo uniforme; los estilos mixtos requieren mapear runs.
  if (/\\uc(?!1\b)\d+/.test(rtf)) throw new Error('Solo se admite el escape Unicode RTF uc1');
  // Los escapes de contenido iniciales (Unicode, saltos, tabs) no son formato.
  const match = /^([\s\S]*?\\pard\b(?:\\(?!u-?\d|(?:par|line|tab)\b)[a-zA-Z]+-?\d* ?|[\r\n])*)([\s\S]*)(\}\s*)$/.exec(rtf);
  if (!match) throw new Error('RTF sin párrafo uniforme: la plantilla no es compatible');
  if (!/^(?:[^\\{}]|\\[\\{}~_-]|\\'[a-fA-F0-9]{2}|\\u-?\d+\?|\\(?:par|line|tab) ?)*$/.test(match[2])) {
    throw new Error('RTF con estilos mixtos o grupos en el texto: no se modificó la plantilla');
  }
  return Buffer.from(match[1] + escapeRtf(text) + match[3], 'latin1');
}

function buildPresentation(name: string, slides: Slide[], type: protobuf.Type, group = name): protobuf.ReflectedMessage {
  const white = { red: 1, green: 1, blue: 1, alpha: 1 };
  const font = { name: 'HelveticaNeue', family: 'Helvetica Neue', size: 64 };
  const cues = slides.map(({ label, text }) => ({
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
  return type.create({
    uuid: id(), name,
    applicationInfo: { platform: 1, application: 1, applicationVersion: { majorVersion: 7, minorVersion: 16, patchVersion: 2 } },
    background: { isEnabled: true, color: { alpha: 1 } },
    cueGroups: [{ group: { uuid: id(), name: group, color: white }, cueIdentifiers: cues.map(cue => cue.uuid) }],
    cues,
  });
}

function slideAction(cue: protobuf.ReflectedMessage): protobuf.ReflectedMessage {
  const actions = cue.actions.filter((action: protobuf.ReflectedMessage) => action.slide?.presentation?.baseSlide);
  if (actions.length !== 1) throw new Error('Se necesita una sola acción de slide por cue');
  return actions[0];
}

function textElement(cue: protobuf.ReflectedMessage, smallest = false): protobuf.ReflectedMessage {
  const elements: protobuf.ReflectedMessage[] = slideAction(cue).slide.presentation.baseSlide.elements;
  let largest: protobuf.ReflectedMessage | undefined;
  let largestArea = smallest ? Infinity : -1;
  for (const { element } of elements) {
    if (!element?.text) continue;
    const size = element.bounds?.size;
    const area = (size?.width ?? 0) * (size?.height ?? 0);
    if (smallest ? area <= largestArea : area > largestArea) {
      largest = element.text;
      largestArea = area;
    }
  }
  if (!largest) throw new Error('La slide de la plantilla no contiene elementos de texto');
  return largest;
}

function remapIds(value: unknown, replacements: Map<string, string>): void {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return;
  const record = value as Record<string, unknown>;
  if (typeof record.string === 'string' && replacements.has(record.string)) {
    record.string = replacements.get(record.string);
  }
  for (const child of Object.values(record)) remapIds(child, replacements);
}

function cloneSlides(source: protobuf.ReflectedMessage, slides: Slide[], root: protobuf.Root, groupName?: string, versionKey = ''): protobuf.ReflectedMessage {
  if (source.cues.length !== 1) throw new Error('Exporta una presentación con exactamente una slide');
  const original = source.cues[0];
  const originalText = textElement(original);
  const Presentation = root.lookupType('rv.data.Presentation');
  const Cue = root.lookupType('rv.data.Cue');
  const encoded = Cue.encode(original).finish();
  // Clonar vía protobuf conserva también campos desconocidos; JSON los perdería.
  const output = decode(Presentation, Presentation.encode(source).finish());
  output.uuid = id();
  output.cues = slides.map(item => {
    const cue = decode(Cue, encoded);
    const action = slideAction(cue);
    const base = action.slide.presentation.baseSlide;
    const identities: { string: string }[] = [cue.uuid,
      ...cue.actions.map((value: protobuf.ReflectedMessage) => value.uuid), base.uuid,
      ...base.elements.map((value: protobuf.ReflectedMessage) => value.element?.uuid)].filter(Boolean);
    remapIds(cue, new Map(identities.map(value => [value.string, id().string])));
    action.label = action.label || {};
    action.label.text = item.label;
    textElement(cue).rtfData = replaceRtf(originalText.rtfData, item.text);
    if (base.elements.filter((value: protobuf.ReflectedMessage) => value.element?.text).length > 1) {
      const reference = textElement(cue, true);
      const label = item.label.replace(/(\d)[a-z]+\b/g, '$1').replace(/-[a-z]+\b/g, '');
      reference.rtfData = replaceRtf(reference.rtfData, `${label} ${versionKey}`.trimEnd());
    }
    return cue;
  });
  for (const group of output.cueGroups) {
    if (groupName !== undefined && (!group.group?.name || group.group.name === source.name)) {
      group.group = group.group || { uuid: id() };
      group.group.name = groupName;
    }
    group.cueIdentifiers = group.cueIdentifiers.flatMap((value: { string: string }) => value.string === original.uuid.string
      ? output.cues.map((cue: protobuf.ReflectedMessage) => cue.uuid) : [value]);
  }
  if (!output.cueGroups.length) {
    output.cueGroups = [{ group: { uuid: id(), name: groupName }, cueIdentifiers: output.cues.map((cue: protobuf.ReflectedMessage) => cue.uuid) }];
  }
  return output;
}

export async function buildPro(opts: {
  name: string;
  group?: string;
  versionKey?: string;
  slides: Slide[];
  templatePath?: string;
  outPath: string;
}): Promise<string> {
  if (!Array.isArray(opts.slides) || !opts.slides.length) throw new Error('Se necesita al menos un texto');
  for (const slide of opts.slides) {
    if (!slide || typeof slide.label !== 'string' || typeof slide.text !== 'string') {
      throw new Error('Cada entrada debe tener label y text de tipo string');
    }
  }
  const root = await loadProtos();
  const Presentation = root.lookupType('rv.data.Presentation');
  const output = opts.templatePath
    ? cloneSlides(decode(Presentation, await readFile(opts.templatePath)), opts.slides, root, opts.group, opts.versionKey)
    : buildPresentation(opts.name, opts.slides, Presentation, opts.group);
  output.name = opts.name;
  const error = Presentation.verify(output);
  if (error) throw new Error(`Presentación no válida: ${error}`);
  const bytes = Presentation.encode(output).finish();
  await mkdir(path.dirname(opts.outPath), { recursive: true });
  await writeFile(opts.outPath, bytes);
  return opts.outPath;
}

export async function readSlideCount(filePath: string): Promise<number> {
  const root = await loadProtos();
  const presentation = decode(root.lookupType('rv.data.Presentation'), await readFile(filePath));
  return presentation.cues.length;
}
