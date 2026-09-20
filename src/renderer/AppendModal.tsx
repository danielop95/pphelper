import { useEffect, useState } from 'react';
import { Heading } from 'react-aria-components';
import type { Config, LibraryItem, PPHelperAPI } from '../types';
import { Button } from './components/base/buttons/button';
import { Select } from './components/base/select/select';
import { ModalOverlay, Modal, Dialog } from './components/application/modals/modal';

const api = window.pphelper;
export function AppendModal({ config, input, close, done }: {
  config: Config; input: Omit<Parameters<PPHelperAPI['appendPro']>[0], 'targetPath'>;
  close: () => void; done: (name: string, added: number, config: Config) => void;
}) {
  const [targets, setTargets] = useState<LibraryItem[]>([]);
  const [target, setTarget] = useState('');
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.proTargets().then(result => {
      if (!active) return;
      setTargets(result.targets); setRunning(result.proPresenterRunning);
      setTarget(result.targets.some(item => item.path === config.lastTarget) ? config.lastTarget! : result.targets[0]?.path || '');
    }).catch(reason => { if (active) setError(String(reason.message)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return <ModalOverlay isOpen isDismissable={!busy} onOpenChange={open => { if (!open && !busy) close(); }}><Modal><Dialog>
    <div className="settings-content append-content">
      <div className="section-heading"><Heading slot="title">Añadir a presentación</Heading></div>
      <Select label="Presentación" data-testid="append-target" placeholder={loading ? 'Cargando…' : 'Elige presentación'} isDisabled={busy || loading} selectedKey={target || null}
        items={targets.map(item => ({ id: item.path, label: `${item.library} · ${item.name}` }))} onSelectionChange={key => setTarget(String(key))}>
        {item => <Select.Item id={item.id}>{item.label}</Select.Item>}
      </Select>
      {!loading && !targets.length && <p>No hay presentaciones disponibles. Elige una biblioteca de destino en Ajustes; la biblioteca de plantillas se excluye.</p>}
      <div className={running ? 'append-warning running' : 'append-warning'}>
        {running && <strong>ProPresenter está abierto.</strong>}
        <p>ProPresenter solo lee el archivo la primera vez que abres esa presentación. Si ya la abriste desde que iniciaste ProPresenter, reinícialo para ver los cambios. Si guardas cambios de esa presentación en ProPresenter después, podrías perder lo añadido; hay copia de seguridad.</p>
      </div>
      <div role="alert" className="error-message" hidden={!error}>{error}</div>
      <div className="settings-actions append-actions"><Button color="secondary" data-testid="close-append" isDisabled={busy} onPress={close}>Cancelar</Button>
        <Button data-testid="confirm-append" isDisabled={!target || loading || busy} isLoading={busy} onPress={async () => {
          setBusy(true); setError('');
          try {
            const result = await api.appendPro({ ...input, targetPath: target });
            setRunning(result.proPresenterRunning);
            done(targets.find(item => item.path === target)!.name, result.added, { ...config, lastTarget: target }); close();
          } catch (reason) { setError(String(reason instanceof Error ? reason.message : reason).replace(/^Error invoking remote method '[^']+': Error: /, '')); }
          finally { setBusy(false); }
        }}>Añadir {input.slides.length} diapositivas</Button>
      </div>
    </div>
  </Dialog></Modal></ModalOverlay>;
}
