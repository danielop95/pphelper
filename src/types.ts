export interface Verse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface Slide {
  label: string;
  text: string;
}

export interface ParsedRef {
  bookId: string;
  bookName: string;
  chapter: number;
  from: number;
  to: number;
}

export interface Config {
  apiBibleKey: string;
  versions: Record<string, string>;
  templates: Record<string, string>;
  maxChars: number;
  libraryPath?: string;
}

export const IPC = {
  lookup: 'verse:lookup',
  build: 'pro:build',
  dragOut: 'pro:drag',
  config: 'config:get',
  configSet: 'config:set',
} as const;
