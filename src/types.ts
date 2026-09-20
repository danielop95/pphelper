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

export interface Limits {
  minChars: number;
  maxChars: number;
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
  libraryPath?: string;
  /** Carpeta de biblioteca de ProPresenter cuyos .pro de una slide son plantillas. */
  templateLibrary?: string;
  lastTemplate?: string;
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
