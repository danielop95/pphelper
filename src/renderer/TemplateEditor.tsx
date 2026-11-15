import { useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ComboBox, ComboBoxStateContext, Heading, ListBox, ListBoxItem, ListLayout, Virtualizer } from 'react-aria-components';
import { ChevronDown } from '@untitledui/icons';
import type { SlideElement, TemplateBox, TemplateDraft } from '../types';
import { SlidePreview } from './SlidePreview';
import { Button } from './components/base/buttons/button';
import { InputBase } from './components/base/input/input';
import { Label } from './components/base/input/label';
import { Popover } from './components/base/select/popover';
import { ModalOverlay, Modal, Dialog } from './components/application/modals/modal';

interface LocalFont { postscriptName: string; family: string; style: string; fullName: string }
declare global { interface Window { queryLocalFonts?: () => Promise<LocalFont[]> } }

const api = window.pphelper;
const SAMPLE = { verse: 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito.', reference: 'Juan 3:16 RVR1960' };
type Role = keyof typeof SAMPLE;
const LABELS: Record<Role, string> = { verse: 'Versículo', reference: 'Cita' };
const TITLES: Record<Role, string> = { verse: 'Texto del versículo', reference: 'Cita (libro, capítulo y versículo)' };

const registered = new Set<string>();
/** Familia CSS que dibuja exactamente esa fuente instalada (FontFace local), con la familia como respaldo. */
function cssFont(font: Pick<LocalFont, 'postscriptName' | 'family'>): string {
  const alias = `pp-${font.postscriptName}`;
  if (!registered.has(alias)) {
    registered.add(alias);
    try { document.fonts.add(new FontFace(alias, `local("${font.postscriptName.replace(/["\\]/g, '')}")`)); } catch { /* Se usa la familia. */ }
  }
  return `"${alias}", "${font.family}"`;
}
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const ROW = 40;

/** Un clic en cualquier parte del campo despliega la lista completa. */
function OpenOnClick({ children }: { children: ReactNode }) {
  const state = useContext(ComboBoxStateContext);
  return <div className="font-picker-field" onClick={() => { if (!state?.isOpen) state?.open(null, 'manual'); }}>{children}</div>;
}

/** Desplegable de tipografías instaladas: cada opción se ve escrita con su propia fuente. */
function FontPicker({ role, font, fonts, disabled, change }: { role: Role; font: TemplateBox['font']; fonts: LocalFont[]; disabled: boolean; change: (font: LocalFont) => void }) {
  const selected = fonts.find(item => item.postscriptName === font.postscriptName);
  const [input, setInput] = useState(selected?.fullName ?? font.family);
  useEffect(() => { if (selected) setInput(selected.fullName); }, [selected?.fullName]);
  // Con el nombre de la fuente elegida en el campo se muestran todas; al escribir, se filtra.
  const items = useMemo(() => input === selected?.fullName ? fonts : fonts.filter(item => fold(item.fullName).includes(fold(input))), [fonts, input, selected]);
  return <ComboBox className="flex flex-col gap-1.5" data-testid={`font-${role}`} aria-label={`Tipografía del ${LABELS[role].toLowerCase()}`} menuTrigger="focus"
    isDisabled={disabled} items={items} inputValue={input} onInputChange={setInput} defaultFilter={() => true}
    selectedKey={selected?.postscriptName ?? null} onSelectionChange={key => { const next = fonts.find(item => item.postscriptName === key); if (next) { setInput(next.fullName); change(next); } }}>
    <Label>Tipografía</Label>
    <OpenOnClick>
      <InputBase placeholder="Busca por nombre" isDisabled={disabled} />
      <ChevronDown className="font-picker-toggle" aria-hidden="true" />
    </OpenOnClick>
    <Popover size="lg" className="font-picker-popover">
      <Virtualizer layout={ListLayout} layoutOptions={{ rowHeight: ROW }}>
        <ListBox className="font-list" style={{ height: Math.max(1, Math.min(items.length, 8)) * ROW }} renderEmptyState={() => <p className="font-empty">Ninguna tipografía con ese nombre.</p>}>
          {(item: LocalFont) => <ListBoxItem id={item.postscriptName} textValue={item.fullName} className="font-option" data-testid="font-option" style={{ fontFamily: cssFont(item) }}>{item.fullName}</ListBoxItem>}
        </ListBox>
      </Virtualizer>
    </Popover>
  </ComboBox>;
}

function element(box: TemplateBox, content: string, role: Role): SlideElement {
  return { x: box.x, y: box.y, width: box.width, height: box.height, opacity: 1, role, text: {
    content, fontFamily: cssFont(box.font), fontSize: box.size, color: box.color, align: box.align, verticalAlign: 'middle',
    bold: /bold|heavy|black/i.test(box.font.style), italic: /italic|oblique/i.test(box.font.style),
  } };
}

function StyleFields({ role, box, fonts, disabled, change }: { role: Role; box: TemplateBox; fonts: LocalFont[]; disabled: boolean; change: (box: TemplateBox) => void }) {
  return <fieldset className="template-style" data-testid={`style-${role}`}>
    <legend>{TITLES[role]}</legend>
    <FontPicker role={role} font={box.font} fonts={fonts} disabled={disabled}
      change={font => change({ ...box, font: { postscriptName: font.postscriptName, family: font.family, style: font.style } })} />
    <label>Tamaño<input type="number" min="4" max="400" value={box.size} disabled={disabled} onChange={event => { if (Number(event.target.value) >= 4) change({ ...box, size: Number(event.target.value) }); }} /></label>
    <label>Color<input type="color" value={box.color} disabled={disabled} onChange={event => change({ ...box, color: event.target.value })} /></label>
    <label>Alineación<select value={box.align} disabled={disabled} onChange={event => change({ ...box, align: event.target.value as TemplateBox['align'] })}>
      <option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option><option value="justify">Justificado</option>
    </select></label>
  </fieldset>;
}

/** Crea una plantilla desde un banner: cajas arrastrables sobre la vista previa y estilo por caja. */
export function TemplateEditor({ initial, close, done }: { initial: TemplateDraft & { image: string }; close: () => void; done: (name: string) => void }) {
  const [name, setName] = useState(initial.name);
  const [boxes, setBoxes] = useState<Record<Role, TemplateBox>>({ verse: initial.verse, reference: initial.reference });
  const [fonts, setFonts] = useState<LocalFont[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ role: Role; resize: boolean; x: number; y: number; box: TemplateBox } | undefined>(undefined);
  useEffect(() => {
    window.queryLocalFonts?.().then(list => setFonts([...list].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))))
      .catch(() => setError('No se pudo leer la lista de tipografías de la Mac; se usará Helvetica Neue.'));
  }, []);

  const start = (role: Role, resize: boolean) => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { role, resize, x: event.clientX, y: event.clientY, box: boxes[role] };
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current, width = stage.current?.clientWidth;
    if (!current || !width) return;
    const scale = 1920 / width, dx = (event.clientX - current.x) * scale, dy = (event.clientY - current.y) * scale, b = current.box;
    const next = current.resize
      ? { ...b, width: Math.min(1920 - b.x, Math.max(40, b.width + dx)), height: Math.min(1080 - b.y, Math.max(20, b.height + dy)) }
      : { ...b, x: Math.min(1920 - b.width, Math.max(0, b.x + dx)), y: Math.min(1080 - b.height, Math.max(0, b.y + dy)) };
    setBoxes(all => ({ ...all, [current.role]: next }));
  };

  const model = { width: 1920, height: 1080, background: 'rgba(0,0,0,0)', elements: [
    element(boxes.verse, SAMPLE.verse, 'verse'), element(boxes.reference, SAMPLE.reference, 'reference'),
    { x: 0, y: 0, width: 1920, height: 1080, opacity: 1, image: initial.image },
  ] };
  const pct = (box: TemplateBox) => ({ left: `${box.x / 19.2}%`, top: `${box.y / 10.8}%`, width: `${box.width / 19.2}%`, height: `${box.height / 10.8}%` });
  // Sin cierre por clic fuera: un clic accidental perdería las cajas y tipografías ajustadas.
  return <ModalOverlay isOpen isDismissable={false} onOpenChange={open => { if (!open && !busy) close(); }}><Modal><Dialog>
    <div className="settings-content template-editor" data-testid="template-editor">
      <div className="section-heading"><Heading slot="title">Crear plantilla desde imagen</Heading></div>
      <label className="template-name-field">Nombre de la plantilla<input data-testid="template-name" value={name} maxLength={120} disabled={busy} onChange={event => setName(event.target.value)} /></label>
      <div className="template-stage" ref={stage} onPointerMove={move} onPointerUp={() => { drag.current = undefined; }}>
        <SlidePreview model={model} />
        {(['verse', 'reference'] as Role[]).map(role => <div key={role} className="template-box" data-testid={`box-${role}`} style={pct(boxes[role])} onPointerDown={start(role, false)}>
          <span>{LABELS[role]}</span><div className="template-box-handle" data-testid={`resize-${role}`} onPointerDown={start(role, true)} />
        </div>)}
      </div>
      <p>Arrastra cada caja para moverla y su punto naranja para cambiar el tamaño. Lo transparente del banner dejará ver el fondo de ProPresenter.</p>
      {(['verse', 'reference'] as Role[]).map(role => <StyleFields key={role} role={role} box={boxes[role]} fonts={fonts} disabled={busy}
        change={box => setBoxes(all => ({ ...all, [role]: box }))} />)}
      <div role="alert" className="error-message" hidden={!error}>{error}</div>
      <div className="settings-actions append-actions"><Button color="secondary" isDisabled={busy} onPress={close}>Cancelar</Button>
        <Button data-testid="save-template" isDisabled={busy || !name.trim()} isLoading={busy} onPress={async () => {
          setBusy(true); setError('');
          try { done(await api.createTemplate({ name, ...boxes })); }
          catch (reason) { setError(String(reason instanceof Error ? reason.message : reason).replace(/^Error invoking remote method '[^']+': Error: /, '')); setBusy(false); }
        }}>Guardar plantilla</Button>
      </div>
    </div>
  </Dialog></Modal></ModalOverlay>;
}
