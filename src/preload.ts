import { contextBridge, ipcRenderer } from 'electron';
import type { IPC, Config, Slide, PPHelperAPI } from './types';

// Sandbox preloads cannot require local modules. Main passes constants, never secrets.
const channels = JSON.parse(process.argv.find(value => value.startsWith('--pphelper-ipc='))!.slice('--pphelper-ipc='.length)) as typeof IPC & {
  local: string; importBibles: string; removeBible: string; renameBible: string; targets: string; append: string;
  library: string; bibles: string; libraries: string; folder: string; edit: string; dragError: string;
};
function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
const api: PPHelperAPI = {
  lookup: (ref, versionKey, template) => ipcRenderer.invoke(channels.lookup, ref, versionKey, template),
  build: input => ipcRenderer.invoke(channels.build, input),
  startDrag: revision => ipcRenderer.send(channels.dragOut, revision),
  sendToLibrary: revision => ipcRenderer.invoke(channels.library, revision),
  getConfig: () => ipcRenderer.invoke(channels.config),
  setConfig: (partial: Partial<Config>) => ipcRenderer.invoke(channels.configSet, partial),
  localBibles: () => ipcRenderer.invoke(channels.local),
  importBibles: () => ipcRenderer.invoke(channels.importBibles),
  removeBible: id => ipcRenderer.invoke(channels.removeBible, id),
  renameBible: (id, abbreviation) => ipcRenderer.invoke(channels.renameBible, id, abbreviation),
  proTargets: () => ipcRenderer.invoke(channels.targets),
  appendPro: input => ipcRenderer.invoke(channels.append, input),
  listBibles: () => ipcRenderer.invoke(channels.bibles),
  listLibraries: () => ipcRenderer.invoke(channels.libraries),
  templates: () => ipcRenderer.invoke(channels.templates),
  slideModel: (file, slide) => ipcRenderer.invoke(channels.slideModel, file, slide),
  reflow: template => ipcRenderer.invoke(channels.reflow, template),
  chooseLibrary: target => ipcRenderer.invoke(channels.folder, target),
  editSlides: (slides: Slide[], index: number, position?: number) => ipcRenderer.invoke(channels.edit, slides, index, position),
  onDragError: callback => subscribe(channels.dragError, callback),
  onTemplatesChanged: callback => subscribe(channels.templatesChanged, callback),
};
contextBridge.exposeInMainWorld('pphelper', api);

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.sandboxed = String(process.sandboxed);
  document.documentElement.dataset.isolated = String(process.contextIsolated);
});
