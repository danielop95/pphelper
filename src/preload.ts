import { contextBridge, ipcRenderer } from 'electron';
import type { IPC, Config, Slide } from './types';

// Sandbox preloads cannot require local modules. Main passes the shared constants, not secrets.
const channels = JSON.parse(process.argv.find(value => value.startsWith('--pphelper-ipc='))!.slice('--pphelper-ipc='.length)) as typeof IPC & {
  library: string; bibles: string; template: string; folder: string; edit: string; dragError: string;
};
contextBridge.exposeInMainWorld('pphelper', {
  lookup: (ref: string, versionKey: string) => ipcRenderer.invoke(channels.lookup, ref, versionKey),
  // A payload prepares the file; a revision starts the native drag synchronously.
  buildAndDrag: (input: { ref: string; versionKey: string; template: string; slides: Slide[] } | number) => {
    if (typeof input === 'number') { ipcRenderer.send(channels.dragOut, input); return; }
    return ipcRenderer.invoke(channels.build, input);
  },
  sendToLibrary: (revision: number) => ipcRenderer.invoke(channels.library, revision),
  getConfig: () => ipcRenderer.invoke(channels.config),
  setConfig: (partial: Partial<Config>) => ipcRenderer.invoke(channels.configSet, partial),
  listBibles: () => ipcRenderer.invoke(channels.bibles),
  addTemplate: () => ipcRenderer.invoke(channels.template),
  chooseLibrary: () => ipcRenderer.invoke(channels.folder),
  editSlides: (slides: Slide[], index: number, position?: number) => ipcRenderer.invoke(channels.edit, slides, index, position),
  onDragError: (callback: (message: string) => void) => { ipcRenderer.on(channels.dragError, (_event, message: string) => callback(message)); },
});
