import { Slide, Verse } from './types';

function nearestCut(text: string, target: number, punctuation: boolean): number {
  const positions = Array.from(text.matchAll(punctuation ? /[.;,:]/g : /\s+/g), m => m.index! + (punctuation ? 1 : 0))
    .filter(pos => text.slice(0, pos).trim() && text.slice(pos).trim());
  return positions.reduce((best, pos) => Math.abs(pos - target) < Math.abs(best - target) ? pos : best, positions[0] ?? Math.max(1, Math.min(text.length - 1, Math.round(target))));
}

function parts(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const hasPunctuation = /[.;,:].*\S/s.test(text);
  const cut = nearestCut(text, text.length / 2, hasPunctuation);
  return [...parts(text.slice(0, cut).trim(), maxChars), ...parts(text.slice(cut).trim(), maxChars)];
}

function suffix(index: number): string {
  let value = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) value = String.fromCharCode(97 + (n - 1) % 26) + value;
  return value;
}

export function toSlides(verses: Verse[], bookName: string, maxChars: number): Slide[] {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1) throw new Error('El límite de caracteres debe ser un entero positivo.');
  return verses.flatMap(verse => {
    const texts = parts(verse.text.trim(), maxChars);
    return texts.map((text, i) => ({ label: `${bookName} ${verse.chapter}:${verse.verse}${texts.length > 1 ? suffix(i) : ''}`, text }));
  });
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
