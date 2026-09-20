import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as protobuf from 'protobufjs';
import type { Slide, SlideElement, SlideModel } from './types';

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

function uniformRtf(rtf: string): RegExpExecArray {
  if (!/^\{\\rtf[01]/.test(rtf)) throw new Error('El elemento no contiene RTF reconocido');
  // ponytail: un único tramo uniforme; los estilos mixtos requieren mapear runs.
  if (/\\uc(?!1\b)\d+/.test(rtf)) throw new Error('Solo se admite el escape Unicode RTF uc1');
  // Los escapes de contenido iniciales (Unicode, saltos, tabs) no son formato.
  const match = /^([\s\S]*?\\pard\b ?(?:\\(?!u-?\d|(?:par|line|tab)\b)[a-zA-Z]+-?\d* ?|[\r\n])*)([\s\S]*)(\}\s*)$/.exec(rtf);
  if (!match) throw new Error('RTF sin párrafo uniforme: la plantilla no es compatible');
  if (!/^(?:[^\\{}]|\\[\\{}~_-]|\\'[a-fA-F0-9]{2}|\\u-?\d+\?|\\(?:par|line|tab) ?)*$/.test(match[2])) {
    throw new Error('RTF con estilos mixtos o grupos en el texto: no se modificó la plantilla');
  }
  return match;
}

function emptyRtf(rtf: string): boolean {
  // Solo cabeceras y tablas: nunca descartar texto o estilos de un párrafo existente.
  const header = rtf.replace(/\{\\(?:fonttbl|colortbl|\*\\expandedcolortbl)(?:[^{}]|\{[^{}]*\})*\}/g, '');
  return /^\{\\rtf[01](?:\s|\\(?:ansi|ansicpg\d+|uc1|deff\d+|deflang\d+|cocoartf\d+|cocoatextscaling\d+|cocoaplatform\d+)\b ?)*\}$/.test(header);
}

function styledRtf(text: string, attributes: Pick<protobuf.ReflectedMessage, 'font' | 'textSolidFill' | 'paragraphStyle'>): Buffer {
  const font = attributes.font || {};
  const name = `${font.name || font.family || ''} ${font.face || ''}`;
  const color = attributes.textSolidFill || { red: 1, green: 1, blue: 1 };
  const rgb = ['red', 'green', 'blue'].map(key => `\\${key}${Math.round((color[key] || 0) * 255)}`).join('');
  const align = ['ql', 'qr', 'qc', 'qj'][attributes.paragraphStyle?.alignment ?? 0] || 'ql';
  return Buffer.from('{\\rtf1\\ansi\\ansicpg1252\\uc1'
    + '{\\fonttbl{\\f0 ' + escapeRtf(font.family || font.name || 'Helvetica Neue') + ';}}'
    + '{\\colortbl;' + rgb + ';}'
    + `\\pard\\${align}\\f0\\fs${Math.round((font.size || 42) * 2)}\\cf1`
    + (font.bold || /bold|heavy|black/i.test(name) ? '\\b' : '')
    + (font.italic || /italic|oblique/i.test(name) ? '\\i' : '')
    + ' ' + escapeRtf(text) + '}', 'latin1');
}

function replaceRtf(elementText: protobuf.ReflectedMessage, text: string): Buffer {
  const rtf = Buffer.from(elementText.rtfData || []).toString('latin1');
  if (emptyRtf(rtf)) return styledRtf(text, elementText.attributes || {});
  const match = uniformRtf(rtf);
  return Buffer.from(match[1] + escapeRtf(text) + match[3], 'latin1');
}

function buildPresentation(name: string, slides: Slide[], type: protobuf.Type, group = name): protobuf.ReflectedMessage {
  const white = { red: 1, green: 1, blue: 1, alpha: 1 };
  const font = { name: 'HelveticaNeue', family: 'Helvetica Neue', size: 64 };
  const attributes = { font, textSolidFill: white, paragraphStyle: { alignment: 2, lineHeightMultiple: 1 } };
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
              attributes,
              verticalAlignment: 1,
              rtfData: styledRtf(text, attributes),
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
    textElement(cue).rtfData = replaceRtf(originalText, item.text);
    if (base.elements.filter((value: protobuf.ReflectedMessage) => value.element?.text).length > 1) {
      const reference = textElement(cue, true);
      const label = item.label.replace(/(\d)[a-z]+\b/g, '$1').replace(/-[a-z]+\b/g, '');
      reference.rtfData = replaceRtf(reference, `${label} ${versionKey}`.trimEnd());
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
  return presentation.cues.reduce((count: number, cue: protobuf.ReflectedMessage) => count
    + cue.actions.filter((action: protobuf.ReflectedMessage) => action.slide?.presentation?.baseSlide).length, 0);
}

function cssColor(color: protobuf.ReflectedMessage): string {
  return `rgba(${Math.round((color.red || 0) * 255)},${Math.round((color.green || 0) * 255)},${Math.round((color.blue || 0) * 255)},${color.alpha || 0})`;
}

async function rtfText(bytes: Uint8Array): Promise<string> {
  if (!bytes.length) return '';
  const rtf = Buffer.from(bytes).toString('latin1');
  try {
    const match = uniformRtf(rtf);
    if (/\\ansicpg(?!1252\b)\d+|\\(?:mac|pc|pca)\b/.test(match[1])) throw new Error('Codificación RTF alternativa');
    const ansi = new TextDecoder('windows-1252');
    return match[2].replace(/[\r\n]/g, '').replace(
      /\\u(-?\d+)\?|\\'([a-fA-F0-9]{2})|\\(par|line|tab) ?|\\([\\{}~_-])|[^\\]+/g,
      (token, unicode: string, hex: string, control: string, symbol: string) => {
        if (unicode !== undefined) return String.fromCharCode(Number(unicode) & 0xffff);
        if (hex !== undefined) return ansi.decode(Uint8Array.of(parseInt(hex, 16)));
        if (control) return control === 'tab' ? '\t' : '\n';
        if (symbol) return ({ '~': '\u00a0', '_': '\u2011', '-': '\u00ad' } as Record<string, string>)[symbol] ?? symbol;
        return ansi.decode(Buffer.from(token, 'latin1'));
      });
  } catch {
    return new Promise((resolve, reject) => {
      const child = execFile('/usr/bin/textutil', ['-convert', 'txt', '-stdin', '-stdout', '-encoding', 'UTF-8'],
        { encoding: 'utf8', maxBuffer: 5e6 }, (error, stdout) => {
          if (error) reject(new Error('No se pudo leer el texto RTF de la diapositiva', { cause: error }));
          else resolve(stdout.replace(/\n$/, ''));
        });
      child.stdin?.on('error', () => { /* execFile comunica el error del proceso. */ });
      child.stdin?.end(Buffer.from(bytes));
    });
  }
}

export async function readSlideModel(filePath: string, slide?: { text: string; reference: string }): Promise<SlideModel> {
  const root = await loadProtos();
  const presentation = decode(root.lookupType('rv.data.Presentation'), await readFile(filePath));
  const base = presentation.cues.flatMap((cue: protobuf.ReflectedMessage) => cue.actions)
    .find((action: protobuf.ReflectedMessage) => action.slide?.presentation?.baseSlide)?.slide.presentation.baseSlide;
  if (!base) throw new Error('La presentación no contiene diapositivas');
  const { width, height } = base.size || {};
  if (!(width > 0 && height > 0)) throw new Error('Tamaño de diapositiva inválido');
  const elements: SlideElement[] = [];
  for (const { element: e } of base.elements) {
    if (!e) continue;
    const b = e.bounds;
    const fill = e.fill;
    const item: SlideElement = {
      x: b?.origin?.x || 0, y: b?.origin?.y || 0,
      width: b?.size?.width || 0, height: b?.size?.height || 0,
      opacity: e.hidden ? 0 : e.opacity,
    };
    if (fill?.enable && fill.color) item.fill = cssColor(fill.color);
    if ((fill?.enable && (fill.gradient || fill.backgroundEffect))
      || (e.path && e.path.shape?.type !== 1) || e.stroke?.enable || e.shadow?.enable
      || e.feather?.enable || e.rotation || e.flipMode) item.unsupported = true;
    if (fill?.enable && fill.media) {
      const url = fill.media.url?.absoluteString;
      try {
        if (!url?.startsWith('file://') || !fill.media.image) throw new Error('Media no compatible');
        const local = fileURLToPath(url);
        const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' } as Record<string, string>)[path.extname(local).toLowerCase()];
        if (!mime) throw new Error('Formato de imagen no compatible');
        item.image = `data:${mime};base64,${(await readFile(local)).toString('base64')}`;
      } catch {
        item.unsupported = true;
      }
    }
    if (e.text) {
      const text = e.text;
      const rtf = Buffer.from(text.rtfData || []).toString('latin1');
      const a = text.attributes || {};
      const font = a.font?.family || a.font?.name || /\\f\d+(?:\\[a-z]+\d*\s*)*\s+([^;{}]+);/.exec(rtf)?.[1] || 'Helvetica Neue';
      const fontName = `${a.font?.name || font} ${a.font?.face || ''}`;
      const rgb = /\\red(\d+)\\green(\d+)\\blue(\d+)/.exec(rtf);
      item.text = {
        content: emptyRtf(rtf) ? '' : await rtfText(text.rtfData || new Uint8Array()),
        fontFamily: font,
        fontSize: a.font?.size || Number(/\\fs(\d+)/.exec(rtf)?.[1] || 84) / 2,
        color: a.textSolidFill ? cssColor(a.textSolidFill) : rgb ? `rgba(${rgb[1]},${rgb[2]},${rgb[3]},1)` : 'rgba(255,255,255,1)',
        bold: !!a.font?.bold || /bold|heavy|black/i.test(fontName) || /\\b(?:1)?\b/.test(rtf),
        italic: !!a.font?.italic || /italic|oblique/i.test(fontName) || /\\i(?:1)?\b/.test(rtf),
        align: a.paragraphStyle ? (['left', 'right', 'center', 'justify'] as const)[a.paragraphStyle.alignment] || 'left'
          : /\\qc\b/.test(rtf) ? 'center' : /\\qr\b/.test(rtf) ? 'right' : /\\qj\b/.test(rtf) ? 'justify' : 'left',
        verticalAlign: (['top', 'middle', 'bottom'] as const)[text.verticalAlignment || 0] || 'top',
      };
      if (a.textGradientFill || a.strokeWidth || text.shadow?.enable) item.unsupported = true;
    }
    elements.push(item);
  }
  const texts = elements.filter(element => element.text);
  if (texts.length) {
    const verse = texts.reduce((a, b) => b.width * b.height > a.width * a.height ? b : a);
    verse.role = 'verse';
    if (slide) verse.text!.content = slide.text;
    if (texts.length > 1) {
      const reference = texts.reduce((a, b) => b.width * b.height <= a.width * a.height ? b : a);
      reference.role = 'reference';
      if (slide) reference.text!.content = slide.reference;
    }
  }
  return {
    width, height,
    background: base.drawsBackgroundColor && base.backgroundColor ? cssColor(base.backgroundColor)
      : presentation.background?.isEnabled && presentation.background.color ? cssColor(presentation.background.color) : 'rgba(0,0,0,0)',
    elements,
  };
}
