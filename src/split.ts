import { Limits, Slide, Verse } from './types';

function nearestCut(text: string, target: number, punctuation: boolean): number {
  const positions = Array.from(text.matchAll(punctuation ? /[.;,:]/g : /\s+/g), m => m.index! + (punctuation ? 1 : 0))
    .filter(pos => text.slice(0, pos).trim() && text.slice(pos).trim());
  return positions.reduce((best, pos) => Math.abs(pos - target) < Math.abs(best - target) ? pos : best, positions[0] ?? Math.max(1, Math.min(text.length - 1, Math.round(target))));
}

function parts(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const count = Math.ceil(text.length / maxChars);
  const size = text.length / count;
  const punctuation = Array.from(text.matchAll(/[.;:,?!](?=\s)/g), m => m.index! + 1);
  const spaces = Array.from(text.matchAll(/\s+/g), m => m.index!);
  const result: string[] = [];
  let start = 0;
  for (let k = 1; k < count && start < text.length; k++) {
    const target = k * size;
    // Reservar capacidad para las partes restantes evita rebasar el máximo.
    const min = Math.max(start + 1, text.length - (count - k) * maxChars);
    const max = Math.min(start + maxChars, text.length - (count - k));
    const valid = (pos: number) => pos >= min && pos <= max && !!text.slice(start, pos).trim() && !!text.slice(pos).trim();
    let candidates = punctuation.filter(pos => valid(pos) && Math.abs(pos - target) <= size / 4);
    if (!candidates.length) candidates = spaces.filter(valid);
    const cut = candidates.reduce((best, pos) => Math.abs(pos - target) < Math.abs(best - target) ? pos : best,
      candidates[0] ?? Math.max(min, Math.min(max, Math.round(target))));
    const part = text.slice(start, cut).trim();
    if (part) result.push(part);
    start = cut;
    while (start < text.length && /\s/.test(text[start])) start++;
  }
  if (start < text.length) result.push(text.slice(start).trim());
  return result;
}

function suffix(index: number): string {
  let value = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) value = String.fromCharCode(97 + (n - 1) % 26) + value;
  return value;
}

export function toSlides(verses: Verse[], bookName: string, limits: Limits | number): Slide[] {
  // ponytail: el criterio es por caracteres, no ancho real; calibrar los límites por plantilla.
  const { minChars, maxChars } = typeof limits === 'number' ? { minChars: 0, maxChars: limits } : limits;
  if (!Number.isSafeInteger(maxChars) || maxChars < 1) throw new Error('El límite de caracteres debe ser un entero positivo.');
  if (!Number.isSafeInteger(minChars) || minChars < 0 || minChars > maxChars) throw new Error('El límite mínimo debe estar entre cero y el máximo.');
  const items = verses.flatMap(verse => {
    const texts = parts(verse.text.trim(), maxChars);
    return texts.map((text, i) => ({
      slide: { label: `${bookName} ${verse.chapter}:${verse.verse}${texts.length > 1 ? suffix(i) : ''}`, text },
      first: verse, last: verse, split: texts.length > 1,
    }));
  });
  const canMerge = (i: number, max: number) => {
    const left = items[i];
    const right = items[i + 1];
    return !left.split && !right.split && left.last.book === right.first.book &&
      left.last.chapter === right.first.chapter && left.last.verse + 1 === right.first.verse &&
      left.slide.text.length + 1 + right.slide.text.length <= max;
  };
  const merge = (i: number) => items.splice(i, 2, {
    ...items[i], last: items[i + 1].last,
    slide: mergeSlides([items[i].slide, items[i + 1].slide], 0)[0],
  });
  for (let i = 0; i + 1 < items.length;) {
    if (items[i].slide.text.length < minChars && canMerge(i, maxChars)) merge(i);
    else i++;
  }
  const last = items.length - 1;
  if (last > 0 && items[last].slide.text.length < minChars && canMerge(last - 1, maxChars + Math.floor(maxChars * 15 / 100))) merge(last - 1);
  return items.map(item => item.slide);
}

export function mergeSlides(slides: Slide[], i: number): Slide[] {
  if (!Number.isInteger(i) || i < 0 || i + 1 >= slides.length) throw new Error('Índice inválido para unir diapositivas.');
  const first = slides[i];
  const second = slides[i + 1];
  const left = first.label.match(/^(.*:)(\d+[a-z]*)(?:-([\da-z]+))?$/);
  const right = second.label.match(/^(.*:)(\d+[a-z]*)(?:-([\da-z]+))?$/);
  let label = `${first.label} - ${second.label}`;
  if (left && right && left[1] === right[1]) {
    const start = left[2];
    let end = right[3] ?? right[2];
    if (/^[a-z]+$/.test(end)) end = right[2].match(/^\d+/)![0] + end;
    const sameVerse = start.match(/^\d+/)![0] === end.match(/^\d+/)![0];
    label = `${left[1]}${start}${start === end ? '' : `-${sameVerse && /[a-z]$/.test(end) ? end.replace(/^\d+/, '') : end}`}`;
  }
  return [...slides.slice(0, i), { label, text: `${first.text.trim()} ${second.text.trim()}` }, ...slides.slice(i + 2)];
}

export function splitSlide(slides: Slide[], i: number, charPos: number): Slide[] {
  if (!Number.isInteger(i) || i < 0 || i >= slides.length) throw new Error('Índice inválido para dividir la diapositiva.');
  const slide = slides[i];
  if (!Number.isInteger(charPos) || charPos <= 0 || charPos >= slide.text.length) throw new Error('Posición de corte inválida.');
  const cut = nearestCut(slide.text, charPos, false);
  const left = slide.text.slice(0, cut).trim();
  const right = slide.text.slice(cut).trim();
  if (!left || !right) throw new Error('La posición de corte deja una diapositiva vacía.');
  return [...slides.slice(0, i), { label: `${slide.label}a`, text: left }, { label: `${slide.label}b`, text: right }, ...slides.slice(i + 1)];
}
