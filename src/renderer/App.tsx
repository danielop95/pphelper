/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Heading } from 'react-aria-components';
import { Settings01, Download01, File06 } from '@untitledui/icons';
import type { BibleOption, Config, LibraryItem, Limits, PPHelperAPI, PreparedFile, Slide, SlideModel } from '../types';
import { SlidePreview } from './SlidePreview';
import { Button } from './components/base/buttons/button';
import { Input } from './components/base/input/input';
import { Select } from './components/base/select/select';
import { Checkbox } from './components/base/checkbox/checkbox';
import { Badge } from './components/base/badges/badges';
import { ModalOverlay, Modal, Dialog } from './components/application/modals/modal';
import logo from './assets/logo.png';
import './styles/globals.css';
import './styles/app.css';

declare global { interface Window { pphelper: PPHelperAPI } }
const api = window.pphelper;
const message = (error: unknown) => String(error instanceof Error ? error.message : error).replace(/^Error invoking remote method '[^']+': Error: /, '');

// Same geometry and typography as pro.ts buildPresentation; the label lives on the cue.
function plainModel(text: string): SlideModel {
  return { width: 1920, height: 1080, background: '#000000', elements: [{
    x: 192, y: 270, width: 1536, height: 540, opacity: 1, role: 'verse',
    text: { content: text, fontFamily: 'Helvetica Neue', fontSize: 64, color: '#ffffff', bold: false, italic: false, align: 'center', verticalAlign: 'middle' },
  }] };
}
function Preview({ file, slide, version, revision }: { file?: string; slide?: Slide; version?: string; revision: number }) {
  const [model, setModel] = useState<SlideModel>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setModel(undefined); setError('');
    if (!file) { setModel(plainModel(slide?.text ?? 'Tu palabra es una lámpara a mis pies.')); return; }
    const timer = setTimeout(() => {
      api.slideModel(file, slide ? { text: slide.text, reference: `${slide.label.replace(/(\d)[a-z]+\b/g, '$1').replace(/-[a-z]+\b/g, '')} ${version || ''}`.trimEnd() } : undefined)
        .then(next => { if (active) setModel(next); })
        .catch(reason => { if (active) setError(message(reason)); });
    }, slide ? 150 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [file, slide?.text, slide?.label, version, revision]);
  return model ? <SlidePreview model={model} /> : <div className="preview-placeholder">{error || 'Preparando vista previa…'}</div>;
}
function LimitFields({ limits, disabled, save }: { limits: Limits; disabled: boolean; save: (limits: Limits) => Promise<void> }) {
  const [min, setMin] = useState(String(limits.minChars));
  const [max, setMax] = useState(String(limits.maxChars));
  useEffect(() => { setMin(String(limits.minChars)); setMax(String(limits.maxChars)); }, [limits.minChars, limits.maxChars]);
  const commit = () => { if (min !== String(limits.minChars) || max !== String(limits.maxChars)) void save({ minChars: min === '' ? NaN : Number(min), maxChars: max === '' ? NaN : Number(max) }); };
  return <div className="limit-fields">
    <label>Mín.<input data-testid="min-chars" type="number" disabled={disabled} min="0" max="10000" value={min} onChange={e => setMin(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
    <label>Máx.<input data-testid="max-chars" type="number" disabled={disabled} min="1" max="10000" value={max} onChange={e => setMax(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
    <span>caracteres</span>
  </div>;
}

function App() {
  const [config, setConfig] = useState<Config>();
  const [reference, setReference] = useState('');
  const [version, setVersion] = useState('');
  const [template, setTemplate] = useState('');
  const [templates, setTemplates] = useState<LibraryItem[]>([]);
  const [templateRevision, setTemplateRevision] = useState(0);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loaded, setLoaded] = useState({ ref: '', version: '' });
  const [edited, setEdited] = useState(false);
  const [ready, setReady] = useState<PreparedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Escribe una referencia y pulsa Enter.');
  const [settings, setSettings] = useState(false);
  const intent = useRef(0);
  const areas = useRef<(HTMLTextAreaElement | null)[]>([]);
  const fail = (reason: unknown) => setError(message(reason));
  const invalidate = () => { setReady(null); return ++intent.current; };

  useEffect(() => {
    let active = true;
    const refreshTemplates = async () => {
      try { const items = await api.templates(); if (active) { setReady(null); setTemplates(items); setTemplateRevision(v => v + 1); } }
      catch (reason) { if (active) fail(reason); }
    };
    const stop = api.onTemplatesChanged(() => { void refreshTemplates(); });
    const stopError = api.onDragError(fail);
    api.getConfig().then(async next => {
      if (!active) return;
      setConfig(next); setVersion(Object.keys(next.versions)[0] || ''); setTemplate(next.lastTemplate || '');
      setSettings(!Object.keys(next.versions).length); if (next.error) fail(next.error);
      await refreshTemplates();
      document.documentElement.dataset.ready = 'true';
    }).catch(fail);
    return () => { active = false; stop(); stopError(); };
  }, []);

  useEffect(() => {
    if (busy || !config || !templateRevision || !template || templates.some(item => item.name === template)) return;
    void selectTemplate('');
  }, [templates, templateRevision, busy]);

  useEffect(() => {
    let active = true;
    const current = intent.current;
    setReady(null);
    if (!slides.length || !loaded.ref || loaded.version !== version || busy) return;
    setStatus('Generando presentación…');
    const timer = setTimeout(() => {
      api.build({ ref: loaded.ref, versionKey: loaded.version, template, slides }).then(file => {
        if (!active || current !== intent.current || !file) return;
        setReady(file); setStatus(`${slides.length} diapositivas listas.`);
      }).catch(reason => { if (active && current === intent.current) { fail(reason); setStatus('No se pudo generar la presentación.'); } });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [slides, loaded, version, template, templateRevision, busy]);

  async function lookup(selectedVersion = version) {
    const current = invalidate(); setSlides([]); setLoaded({ ref: '', version: '' }); setBusy(true); setError(''); setStatus('Buscando pasaje…');
    try {
      const result = await api.lookup(reference, selectedVersion, template);
      if (current !== intent.current) return;
      setSlides(result.slides); setLoaded({ ref: result.ref, version: selectedVersion }); setEdited(false);
    } catch (reason) { if (current === intent.current) { fail(reason); setStatus('No se pudo consultar el pasaje.'); } }
    finally { if (current === intent.current) setBusy(false); }
  }
  async function reflow(selectedTemplate = template) {
    if (!loaded.ref) return;
    const current = invalidate(); setBusy(true); setError('');
    try { const next = await api.reflow(selectedTemplate); if (current === intent.current) { setSlides(next); setEdited(false); } }
    catch (reason) { if (current === intent.current) fail(reason); }
    finally { if (current === intent.current) setBusy(false); }
  }
  async function selectTemplate(name: string) {
    const current = invalidate(); setBusy(true); setTemplate(name); setError('');
    try {
      const next = await api.setConfig({ lastTemplate: name });
      if (current !== intent.current) return;
      setConfig(next);
      if (!edited) await reflow(name);
      else setStatus('Ediciones conservadas. Reorganiza para aplicar los nuevos cortes.');
    } catch (reason) { fail(reason); }
    finally { if (current === intent.current) setBusy(false); }
  }
  async function edit(index: number, position?: number) {
    const current = invalidate(); setBusy(true); setError('');
    try {
      const next = await api.editSlides(slides, index, position);
      if (current === intent.current) { setSlides(next); setEdited(true); requestAnimationFrame(() => areas.current[index]?.focus()); }
    } catch (reason) { if (current === intent.current) fail(reason); }
    finally { if (current === intent.current) setBusy(false); }
  }
  async function saveLimits(limits: Limits) {
    setBusy(true); setError('');
    try {
      setConfig(await api.setConfig({ templateLimits: { ...config?.templateLimits, [template]: limits } }));
      await reflow();
    } catch (reason) { fail(reason); }
    finally { setBusy(false); }
  }
  function configChanged(next: Config) {
    setConfig(next);
    if (!Object.hasOwn(next.versions, version)) {
      invalidate(); setVersion(Object.keys(next.versions)[0] || ''); setSlides([]); setLoaded({ ref: '', version: '' }); setEdited(false);
    }
  }
  const selectedFile = templates.find(item => item.name === template)?.path;
  const limits = config?.templateLimits?.[template] ?? { minChars: config?.minChars ?? 80, maxChars: config?.maxChars ?? 180 };
  const choices = [{ name: '', path: '', library: '' }, ...templates];
  return <>
    <main className="app-content">
      <header className="app-header"><h1><img src={logo} width={28} height={28} alt="" />pphelper</h1><Button color="tertiary" size="sm" iconLeading={Settings01} data-testid="settings" onPress={() => setSettings(true)}>Ajustes</Button></header>
      <form data-testid="lookup-form" onSubmit={event => { event.preventDefault(); if (!busy) void lookup(); }} className="lookup-form">
        <Input label="Referencia bíblica" placeholder="Juan 3:16-18" value={reference} onChange={setReference} data-testid="reference" isDisabled={busy} />
        <Select label="Versión" aria-label="Versión" placeholder="Elige Biblia" size="sm" data-testid="version" isDisabled={busy} selectedKey={version || null}
          items={Object.keys(config?.versions ?? {}).map(key => ({ id: key, label: key }))}
          onSelectionChange={key => { const next = String(key); invalidate(); setVersion(next); if (reference.trim()) void lookup(next); }}>
          {item => <Select.Item id={item.id}>{item.label}</Select.Item>}
        </Select>
        <Button type="submit" data-testid="search" isDisabled={busy || !version || !reference.trim()} isLoading={busy}>Buscar</Button>
      </form>
      <div role="alert" data-testid="error" className="error-message" hidden={!error}>{error}</div>
      <section aria-labelledby="templates-heading" className="templates-section">
        <div className="section-heading"><h2 id="templates-heading">Plantilla</h2><span>{templates.length ? `${templates.length} disponibles` : 'Elige una biblioteca en Ajustes'}</span></div>
        <div className="template-grid">
          {choices.map(item => <div key={item.path} className={`template-card${template === item.name ? ' selected' : ''}`}>
            <button type="button" data-testid={item.name ? 'template-card' : 'no-template'} data-template={item.name} aria-pressed={template === item.name} disabled={busy}
              onClick={() => { void selectTemplate(item.name); }}>
              <Preview file={item.path || undefined} revision={templateRevision} />
              <span className="template-name">{item.name || 'Sin plantilla'}</span>
            </button>
            {template === item.name && <LimitFields limits={limits} disabled={busy} save={saveLimits} />}
          </div>)}
        </div>
      </section>
      <section aria-labelledby="slides-heading">
        <div className="section-heading"><h2 id="slides-heading">Diapositivas <span>{slides.length}</span></h2>
          <Button data-testid="reflow" size="sm" color={edited ? 'primary' : 'secondary'} isDisabled={busy || !slides.length} onPress={() => { void reflow(); }}>Reorganizar</Button>
        </div>
        {edited && <p className="edit-note">Tienes ediciones manuales. Reorganizar las reemplaza por el pasaje original.</p>}
        {!slides.length && <div className="empty-state"><File06 aria-hidden="true" /><p>{busy ? 'Buscando tu pasaje…' : 'Tu próximo pasaje, listo para proyectar'}</p><span>Busca una referencia para revisar y ajustar sus diapositivas.</span></div>}
        <ol className="slide-list" data-testid="slides">{slides.map((slide, index) => <li className="slide-row" key={index} data-testid="slide-row">
          <div className="slide-heading"><label htmlFor={`slide-${index}`}>{index + 1}. {slide.label}</label><span className="overflow-badge" data-testid="overflow-badge"><Badge color="warning">No cabe</Badge></span></div>
          <Preview file={selectedFile} slide={slide} version={loaded.version} revision={templateRevision} />
          <textarea id={`slide-${index}`} data-testid="slide-text" ref={node => { areas.current[index] = node; }} value={slide.text} rows={3} disabled={busy}
            onChange={event => { invalidate(); setError(''); setEdited(true); setSlides(slides.map((s, i) => i === index ? { ...s, text: event.target.value } : s)); }} />
          <div className="slide-actions"><Button size="sm" color="tertiary" data-testid="merge" isDisabled={busy || index === slides.length - 1} onPress={() => { void edit(index); }}>Unir con siguiente</Button>
            <Button size="sm" color="tertiary" data-testid="split" isDisabled={busy} onPress={() => {
              const position = areas.current[index]?.selectionStart ?? 0;
              if (position <= 0 || position >= slide.text.length) { setError('Coloca el cursor dentro del texto para partir la diapositiva.'); areas.current[index]?.focus(); return; }
              void edit(index, position);
            }}>Partir aquí</Button></div>
        </li>)}</ol>
      </section>
      <p className="preview-note">Vista aproximada. Revisa el diseño final en ProPresenter.</p>
    </main>
    <footer className="delivery-bar">
      <div data-testid="drag-card" className="drag-card" draggable={!!ready} aria-disabled={!ready} onDragStart={event => { event.preventDefault(); if (ready) api.startDrag(ready.revision); }}>
        <File06 aria-hidden="true" /><div><strong>{ready?.name || (slides.length ? 'Preparando archivo…' : 'Tu presentación aparecerá aquí')}</strong><span>Arrastra a una playlist de ProPresenter</span></div>
      </div>
      <div className="delivery-actions"><p role="status" data-testid="status">{status}</p><Button size="sm" iconLeading={Download01} data-testid="send-library" isDisabled={!ready || sending} onPress={async () => {
        if (!ready) return; setSending(true); setError('');
        try { await api.sendToLibrary(ready.revision); setStatus('Enviado a la biblioteca de ProPresenter.'); } catch (reason) { fail(reason); } finally { setSending(false); }
      }}>Enviar a biblioteca</Button></div>
    </footer>
    {config && <Settings open={settings} close={() => setSettings(false)} config={config} changed={configChanged} />}
  </>;
}

function Settings({ open, close, config, changed }: { open: boolean; close: () => void; config: Config; changed: (next: Config) => void }) {
  const [key, setKey] = useState(config.apiBibleKey);
  const [libraries, setLibraries] = useState<{ name: string; path: string }[]>([]);
  const [bibles, setBibles] = useState<BibleOption[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setKey(config.apiBibleKey); api.listLibraries().then(setLibraries).catch(reason => setError(message(reason))); } }, [open]);
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (reason) { setError(message(reason)); } finally { setBusy(false); } };
  const folders = libraries.some(item => item.path === config.templateLibrary) || !config.templateLibrary ? libraries : [...libraries, { name: config.templateLibrary.split('/').at(-1) || config.templateLibrary, path: config.templateLibrary }];
  const options = [{ id: '__none', label: 'Sin biblioteca' }, ...folders.map(item => ({ id: item.path, label: item.name })), { id: '__choose', label: 'Elegir carpeta…' }];
  const available = bibles.length ? bibles : Object.entries(config.versions).map(([key, id]) => ({ key, id, name: key }));
  return <ModalOverlay isOpen={open} onOpenChange={value => { if (!value) close(); }} isDismissable><Modal><Dialog>
    <div className="settings-content"><div className="section-heading"><Heading slot="title">Ajustes</Heading><Button size="sm" color="tertiary" onPress={close} data-testid="close-settings">Cerrar</Button></div>
      <div role="alert" className="error-message" hidden={!error}>{error}</div>
      <section><h3>Biblias</h3><Input type="password" label="Clave de API.Bible" value={key} onChange={setKey} autoComplete="off" />
        <div className="settings-actions"><Button size="sm" color="secondary" isDisabled={busy} onPress={() => { void run(async () => { changed(await api.setConfig({ apiBibleKey: key.trim() })); setBibles(await api.listBibles()); }); }}>Cargar Biblias</Button>
          <Button size="sm" color="tertiary" isDisabled={busy} onPress={() => { void run(async () => { changed(await api.setConfig({ apiBibleKey: key.trim() })); }); }}>Guardar clave</Button></div>
        <div className="bible-list">{available.length ? available.map(bible => <Checkbox key={bible.id} label={`${bible.key} · ${bible.name}`} isDisabled={busy} isSelected={Object.values(config.versions).includes(bible.id)} onChange={checked => { void run(async () => {
          const versions = { ...config.versions }; for (const [name, id] of Object.entries(versions)) if (id === bible.id) delete versions[name];
          if (checked) { let name = bible.key; for (let n = 2; Object.hasOwn(versions, name); n++) name = `${bible.key} ${n}`; versions[name] = bible.id; }
          changed(await api.setConfig({ versions }));
        }); }} />) : <p>Carga la lista y marca las versiones que quieras usar.</p>}</div>
      </section>
      <section><Select label="Biblioteca de plantillas" selectedKey={config.templateLibrary || '__none'} items={options} isDisabled={busy} data-testid="template-library" onSelectionChange={value => { void run(async () => {
        const next = value === '__choose' ? await api.chooseLibrary('templateLibrary') : await api.setConfig({ templateLibrary: value === '__none' ? '' : String(value) }); if (next) changed(next);
      }); }}>{item => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select>
        <p>Se muestran los archivos .pro de una sola diapositiva. Los cambios en la carpeta se sincronizan automáticamente.</p>
        {config.templateLibrary && <p className="folder-path">{config.templateLibrary}</p>}
        {!config.templateLibrary && Object.keys(config.templates).length > 0 && <p className="migration-notice" data-testid="legacy-notice">Tus plantillas anteriores siguen guardadas. Elige su carpeta como biblioteca para usarlas; no se ha borrado ningún archivo.</p>}
      </section>
      <section><h3>Destino de la presentación</h3><p className="folder-path">{config.libraryPath || 'Ninguna biblioteca seleccionada'}</p><Button color="secondary" size="sm" isDisabled={busy} onPress={() => { void run(async () => { const next = await api.chooseLibrary('libraryPath'); if (next) changed(next); }); }}>Elegir biblioteca de destino</Button></section>
    </div>
  </Dialog></Modal></ModalOverlay>;
}

createRoot(document.getElementById('root')!).render(<App />);
