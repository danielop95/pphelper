import type { LocalBible } from './bibledb';
export interface Verse {
  book: string;
  chapter: number;
  verse: number;
  verseEnd?: number;
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

export interface Limits {
  minChars: number;
  maxChars: number;
}

/** Índices (en SlideModel.elements) de las cajas de texto elegidas a mano para una plantilla. */
export interface TextRoles {
  verse: number;
  reference?: number;
}

export interface Config {
  apiBibleKey: string;
  versions: Record<string, string>;
  /** Obsoleto: las plantillas ahora se detectan en `templateLibrary`. Se conserva para leer configs antiguas. */
  templates: Record<string, string>;
  maxChars: number;
  minChars?: number;
  /** Límites por nombre de plantilla; si falta, se usan minChars/maxChars globales. */
  templateLimits?: Record<string, Limits>;
  /** Caja de versículo/cita elegida a mano por nombre de plantilla; si falta, se detecta por área. */
  templateRoles?: Record<string, TextRoles>;
  libraryPath?: string;
  /** Carpeta de biblioteca de ProPresenter cuyos .pro de una slide son plantillas. */
  templateLibrary?: string;
  lastTemplate?: string;
  lastTarget?: string;
}

/** Elemento de una slide, en unidades de la slide (px de diseño), listo para dibujar. */
export interface SlideElement {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  /** Color CSS del relleno sólido, si está activado. */
  fill?: string;
  /** Imagen de relleno como data URI. */
  image?: string;
  text?: {
    content: string;
    fontFamily: string;
    fontSize: number;
    color: string;
    bold: boolean;
    italic: boolean;
    align: 'left' | 'center' | 'right' | 'justify';
    verticalAlign: 'top' | 'middle' | 'bottom';
  };
  /** 'verse' = texto de mayor área; 'reference' = texto de menor área cuando hay 2 o más. */
  role?: 'verse' | 'reference';
  /** true si el elemento usa algo que el render no soporta (degradado, forma no rectangular, etc.). */
  unsupported?: boolean;
}

export interface SlideModel {
  width: number;
  height: number;
  background: string;
  elements: SlideElement[];
}

export interface LibraryItem {
  name: string;
  path: string;
  library: string;
}

export const IPC = {
  lookup: 'verse:lookup',
  build: 'pro:build',
  dragOut: 'pro:drag',
  config: 'config:get',
  configSet: 'config:set',
  templates: 'templates:list',
  templatesChanged: 'templates:changed',
  slideModel: 'slide:model',
  reflow: 'slides:reflow',
} as const;

export interface PreparedFile { name: string; revision: number }
export interface BibleOption { id: string; key: string; name: string }
export interface PPHelperAPI {
  lookup(ref: string, versionKey: string, template: string): Promise<{ ref: string; slides: Slide[] }>;
  build(input: { ref: string; versionKey: string; template: string; slides: Slide[] }): Promise<PreparedFile | null>;
  startDrag(revision: number): void;
  sendToLibrary(revision: number): Promise<string>;
  getConfig(): Promise<Config & { error?: string }>;
  setConfig(partial: Partial<Config>): Promise<Config>;
  listBibles(): Promise<BibleOption[]>;
  localBibles(): Promise<LocalBible[]>;
  importBibles(): Promise<{ imported: LocalBible[]; errors: { file: string; message: string }[] }>;
  removeBible(id: string): Promise<Config>;
  renameBible(id: string, abbreviation: string): Promise<Config>;
  proTargets(): Promise<{ targets: LibraryItem[]; proPresenterRunning: boolean }>;
  appendPro(input: { targetPath: string; ref: string; versionKey: string; template: string; slides: Slide[] }): Promise<{ backup: string; added: number; proPresenterRunning: boolean }>;

  listLibraries(): Promise<{ name: string; path: string }[]>;
  templates(): Promise<LibraryItem[]>;
  slideModel(file: string, slide?: { text: string; reference: string }, roles?: TextRoles): Promise<SlideModel>;
  reflow(template: string): Promise<Slide[]>;
  chooseLibrary(target: 'libraryPath' | 'templateLibrary'): Promise<Config | null>;
  editSlides(slides: Slide[], index: number, position?: number): Promise<Slide[]>;
  onDragError(callback: (message: string) => void): () => void;
  onTemplatesChanged(callback: () => void): () => void;
  checkUpdate(): Promise<{ version: string } | null>;
  openUpdate(): Promise<void>;
}
