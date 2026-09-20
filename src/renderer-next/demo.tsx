import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Heading } from 'react-aria-components';
import type { SlideModel } from '../types';
import { SlidePreview } from './SlidePreview';
import { Button } from './components/base/buttons/button';
import { Input } from './components/base/input/input';
import { Select } from './components/base/select/select';
import { Checkbox } from './components/base/checkbox/checkbox';
import { Badge } from './components/base/badges/badges';
import { Tooltip, TooltipTrigger } from './components/base/tooltip/tooltip';
import { DialogTrigger, ModalOverlay, Modal, Dialog } from './components/application/modals/modal';
import { Tabs } from './components/application/tabs/tabs';
import './styles/globals.css';

const textStyle = {
  fontFamily: 'Helvetica Neue, sans-serif', fontSize: 64, color: '#ffffff',
  bold: false, italic: false, align: 'left', verticalAlign: 'middle',
} as const;

const examples: { title: string; note: string; model: SlideModel }[] = [
  {
    title: 'Banner inferior', note: 'Relleno, versículo y referencia en capas.',
    model: { width: 1920, height: 1080, background: '#102329', elements: [
      { x: 0, y: 710, width: 1920, height: 370, opacity: 1, fill: '#245d60' },
      { x: 100, y: 750, width: 1720, height: 160, opacity: 1, role: 'verse',
        text: { ...textStyle, content: 'El Señor es mi pastor;\nnada me faltará.' } },
      { x: 100, y: 950, width: 1720, height: 70, opacity: 0.8, role: 'reference',
        text: { ...textStyle, content: 'SALMO 23:1', fontSize: 40, bold: true } },
    ] },
  },
  {
    title: 'Pantalla completa', note: 'Texto centrado que escala con el lienzo.',
    model: { width: 1920, height: 1080, background: '#171d28', elements: [
      { x: 192, y: 200, width: 1536, height: 680, opacity: 1, role: 'verse',
        text: { ...textStyle, content: 'Lámpara es a mis pies tu palabra,\ny lumbrera a mi camino.', fontSize: 76, align: 'center', italic: true } },
    ] },
  },
  {
    title: 'Revisión de límites', note: 'Borde discontinuo: efecto no compatible. Texto: no cabe.',
    model: { width: 1920, height: 1080, background: '#29221c', elements: [
      { x: 120, y: 120, width: 1680, height: 840, opacity: 0.6, unsupported: true, fill: '#665039',
        image: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="2" height="2"%3E%3Cpath fill="%23594432" d="M0 0h2v2H0z"/%3E%3C/svg%3E' },
      { x: 240, y: 260, width: 1440, height: 70, opacity: 1, role: 'verse',
        text: { ...textStyle, content: 'Este texto supera su caja.\nLa segunda línea sigue visible.\nLa interfaz puede avisar: «no cabe».', fontSize: 74, bold: true } },
    ] },
  },
];

function Demo() {
  const [reference, setReference] = useState('Salmos 23:1');
  const [version, setVersion] = useState('rvr09');
  const [message, setMessage] = useState('Demo local · 3 diseños de ejemplo');
  const versions = [{ id: 'rvr09', label: 'Reina-Valera 1909' }, { id: 'ntv', label: 'Nueva Traducción Viviente' }];
  return <main className="mx-auto max-w-7xl px-8 py-8">
    <header className="mb-7 flex items-center justify-between gap-6">
      <div><p className="mb-2 text-sm font-semibold text-brand-secondary">PPHELPER / MESA DE PRUEBAS</p>
        <h1 className="text-display-sm font-semibold text-primary">Una vista antes de proyectar</h1></div>
      <DialogTrigger>
        <Button color="secondary">Ajustes</Button>
        <ModalOverlay isDismissable><Modal className="max-w-md"><Dialog>
          {({ close }) => <div className="flex flex-col gap-6 p-6">
            <Heading slot="title" className="text-xl font-semibold text-primary">Ajustes de vista previa</Heading>
            <Checkbox label="Mostrar avisos de diseño" defaultSelected />
            <p className="text-sm text-tertiary">Los efectos no compatibles se señalan con un borde discontinuo.</p>
            <Button onPress={close}>Cerrar ajustes</Button>
          </div>}
        </Dialog></Modal></ModalOverlay>
      </DialogTrigger>
    </header>
    <div className="mb-7 grid items-end gap-5 sm:grid-cols-3">
      <Input label="Referencia bíblica" value={reference} onChange={setReference} />
      <Select label="Traducción" items={versions} selectedKey={version} onSelectionChange={key => setVersion(String(key))}>
        {item => <Select.Item id={item.id}>{item.label}</Select.Item>}
      </Select>
      <Button onPress={() => setMessage(`Preparado: ${reference} · ${version.toUpperCase()}`)}>Preparar slides</Button>
    </div>
    <Tabs defaultSelectedKey="previews">
      <Tabs.List type="underline" aria-label="Secciones de la demo">
        <Tabs.Item id="previews">Vistas previas</Tabs.Item><Tabs.Item id="components">Componentes</Tabs.Item>
      </Tabs.List>
      <Tabs.Panel id="previews" className="pt-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {examples.map(({ title, note, model }, index) => <figure key={title}>
            <SlidePreview model={model} />
            <figcaption className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-md font-semibold text-primary">{title}</h2>
                <Badge color={index === 2 ? 'warning' : 'success'}>{index === 2 ? 'Revisar' : 'Listo'}</Badge></div>
              <p className="text-sm text-tertiary">{note}</p>
            </figcaption>
          </figure>)}
        </div>
      </Tabs.Panel>
      <Tabs.Panel id="components" className="py-6 text-sm text-secondary">Button, Input, Select, Checkbox, Badge, Tooltip, Modal y Tabs · Untitled UI MIT.</Tabs.Panel>
    </Tabs>
    <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-secondary pt-5">
      <p role="status" className="text-sm text-secondary">{message}</p>
      <Tooltip title="El render es aproximado; revisa la presentación final en ProPresenter.">
        <TooltipTrigger className="text-sm font-semibold text-brand-secondary">Acerca de la vista previa</TooltipTrigger>
      </Tooltip>
    </footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Demo />);
