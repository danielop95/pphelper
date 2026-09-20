import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from './components/base/buttons/button';
import { Input } from './components/base/input/input';
import { Select } from './components/base/select/select';
import './styles/globals.css';

function App() {
  const [reference, setReference] = useState('Juan 3:16');
  const [version, setVersion] = useState<string>('ntv');
  const [message, setMessage] = useState('Listo para preparar las slides.');
  const versions = [{ id: 'ntv', label: 'Nueva Traducción Viviente' }, { id: 'rvr09', label: 'Reina-Valera 1909' }];
  return <main className="mx-auto max-w-xl px-8 py-12">
    <p className="mb-3 text-sm font-semibold text-brand-secondary">PPHELPER / SPIKE 2</p>
    <h1 className="mb-3 text-display-sm font-semibold text-primary">Prepara el pasaje</h1>
    <p className="mb-8 text-md text-tertiary">Prueba aislada de componentes Untitled UI en Electron.</p>
    <div className="flex flex-col gap-6">
      <Input label="Referencia bíblica" value={reference} onChange={setReference} hint="Escribe un libro, capítulo y versículo." />
      <Select label="Traducción" items={versions} selectedKey={version} onSelectionChange={key => setVersion(String(key))}>
        {item => <Select.Item id={item.id}>{item.label}</Select.Item>}
      </Select>
      <Button onPress={() => setMessage(`Preparado: ${reference} · ${version.toUpperCase()}`)}>Preparar slides</Button>
      <p role="status" className="text-sm text-secondary">{message}</p>
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
