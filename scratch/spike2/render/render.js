// Aproximación estática, no motor completo de ProPresenter. macOS textutil decodifica RTF.
const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { execFileSync } = require('node:child_process');
const { load, decode } = require('../proto');
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const color = c => `rgba(${Math.round((c.red || 0) * 255)},${Math.round((c.green || 0) * 255)},${Math.round((c.blue || 0) * 255)},${c.alpha || 0})`;
function textInfo(text) {
  const rtf = Buffer.from(text.rtfData || []).toString('latin1');
  const a = text.attributes || {};
  const plain = rtf ? execFileSync('/usr/bin/textutil', ['-convert', 'txt', '-stdin', '-stdout', '-encoding', 'UTF-8'], { input: Buffer.from(text.rtfData), maxBuffer: 5e6 }).toString('utf8').replace(/\n$/, '') : '';
  const font = a.font?.family || a.font?.name || /\\f\d+(?:\\[a-z]+\d*\s*)*\s+([^;{}]+);/.exec(rtf)?.[1] || 'Helvetica Neue';
  const size = a.font?.size || Number(/\\fs(\d+)/.exec(rtf)?.[1] || 84) / 2;
  const rgb = /\\red(\d+)\\green(\d+)\\blue(\d+)/.exec(rtf);
  const fill = a.textSolidFill ? color(a.textSolidFill) : rgb ? `rgb(${rgb[1]},${rgb[2]},${rgb[3]})` : '#fff';
  const align = a.paragraphStyle ? ['left', 'right', 'center', 'justify', 'start'][a.paragraphStyle.alignment] : /\\qc\b/.test(rtf) ? 'center' : /\\qr\b/.test(rtf) ? 'right' : 'left';
  return { plain, font, size, fill, align: align || 'left', vertical: ['flex-start', 'center', 'flex-end'][text.verticalAlignment || 0] };
}
async function render(file, out = path.join(__dirname, '../out')) {
  const root = await load(), P = root.lookupType('rv.data.Presentation');
  const presentation = decode(P, await fs.readFile(file));
  await fs.mkdir(out, { recursive: true });
  const files = [], inventory = [];
  for (const [ci, cue] of presentation.cues.entries()) {
    for (const [ai, action] of cue.actions.entries()) {
      const slide = action.slide?.presentation?.baseSlide;
      if (!slide) continue;
      const { width, height } = slide.size;
      if (!(width > 0 && height > 0)) throw Error('Tamaño de slide inválido');
      const elements = [];
      for (const wrapper of slide.elements) {
        const e = wrapper.element;
        if (!e) continue;
        const b = e.bounds, t = e.text ? textInfo(e.text) : null;
        const fill = e.fill;
        const item = { name: e.name, info: wrapper.info, bounds: b, shape: e.path?.shape?.type, fill: fill?.FillType,
          fillEnabled: !!fill?.enable, text: t, strokeEnabled: !!e.stroke?.enable, shadowEnabled: !!e.shadow?.enable,
          featherEnabled: !!e.feather?.enable, media: fill?.media?.url?.absoluteString || null };
        inventory.push(item);
        let content = '';
        if (fill?.enable && fill.media) {
          const url = fill.media.url?.absoluteString;
          if (url?.startsWith('file://') && fill.media.image) {
            const local = fileURLToPath(url), ext = path.extname(local).slice(1).toLowerCase();
            const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext];
            if (mime) {
              const data = await fs.readFile(local);
              const fit = ['contain', 'cover', 'fill'][fill.media.image.drawing?.scaleBehavior || 0] || 'contain';
              content += `<img alt="" src="data:${mime};base64,${data.toString('base64')}" style="position:absolute;width:100%;height:100%;object-fit:${fit}">`;
            } else item.unsupported = 'Formato de imagen';
          } else item.unsupported = 'Media sin imagen file:// local';
        }
        const styles = [`left:${(b?.origin?.x || 0) / width * 100}%`, `top:${(b?.origin?.y || 0) / height * 100}%`,
          `width:${(b?.size?.width || 0) / width * 100}%`, `height:${(b?.size?.height || 0) / height * 100}%`,
          `opacity:${e.opacity}`, `background:${fill?.enable && fill.color ? color(fill.color) : 'transparent'}`];
        if (t) {
          styles.push(`font-family:${JSON.stringify(t.font)}`, `font-size:${t.size / width * 100}cqw`, `color:${t.fill}`, `justify-content:${t.vertical}`, `text-align:${t.align}`);
          content += `<span style="position:relative;width:100%;white-space:pre-wrap">${esc(t.plain)}</span>`;
        }
        elements.push(`<div class="element" style="${esc(styles.join(';'))}">${content}</div>`);
      }
      const bg = slide.drawsBackgroundColor && slide.backgroundColor ? color(slide.backgroundColor)
        : presentation.background?.isEnabled && presentation.background.color ? color(presentation.background.color) : 'transparent';
      const title = `${path.basename(file, '.pro')}-${ci + 1}-${ai + 1}`;
      const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'"><title>${esc(title)}</title><style>*{box-sizing:border-box}html,body{margin:0;background:#000}.slide{position:relative;container-type:inline-size;aspect-ratio:${width}/${height};width:100%;overflow:hidden;background:${bg}}.element{position:absolute;display:flex;flex-direction:column;overflow:hidden;line-height:1.2}</style><main class="slide" data-width="${width}" data-height="${height}">${elements.join('')}</main></html>`;
      const target = path.join(out, title + '.html');
      await fs.writeFile(target, html); files.push(target);
    }
  }
  await fs.writeFile(path.join(out, path.basename(file, '.pro') + '-inventory.json'), JSON.stringify(inventory, null, 2));
  return files;
}
module.exports = { render, textInfo };
if (require.main === module) {
  if (!process.argv[2]) { console.error('Uso: node render.js archivo.pro [directorio]'); process.exitCode = 1; }
  else render(process.argv[2], process.argv[3]).then(files => console.log(files.join('\n'))).catch(e => { console.error('FALLA:', e.message); process.exitCode = 1; });
}
