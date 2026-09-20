// El mismo archivo sirve de preload aislado y de proceso principal.
if (process.type === 'renderer') {
  const { ipcRenderer } = require('electron');
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('card').addEventListener('dragstart', event => {
      event.preventDefault();
      ipcRenderer.send('spike:drag');
    });
    ipcRenderer.on('spike:status', (_event, text) => {
      document.getElementById('status').textContent = text;
    });
    document.documentElement.dataset.dragReady = 'true';
  });
} else {
  const { app, BrowserWindow, ipcMain } = require('electron');
  const fs = require('node:fs');
  const path = require('node:path');
  const file = path.resolve(process.env.PRO_FILE || path.join(__dirname, '../out/Juan 3.16-17.pro'));
  const smoke = process.argv.includes('--smoke');
  app.whenReady().then(async () => {
    if (!fs.statSync(file).isFile() || path.extname(file) !== '.pro') throw new Error('PRO_FILE debe ser un archivo .pro existente');
    const icon = await app.getFileIcon(file, { size: 'normal' });
    if (icon.isEmpty()) throw new Error('El sistema no pudo obtener un icono para el archivo');
    const window = new BrowserWindow({
      width: 540, height: 330, show: !smoke,
      webPreferences: { preload: __filename, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    ipcMain.on('spike:drag', event => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return;
      try {
        event.sender.startDrag({ file, icon });
        console.log(`startDrag: ${file}`);
        event.sender.send('spike:status', 'Arrastre iniciado; confirma la importación en ProPresenter.');
      } catch (error) {
        event.sender.send('spike:status', `No se pudo iniciar el arrastre: ${error.message}`);
      }
    });
    await window.loadFile(path.join(__dirname, 'index.html'));
    window.webContents.send('spike:status', file);
    if (smoke) {
      const ready = await window.webContents.executeJavaScript('document.getElementById("card").draggable && document.documentElement.dataset.dragReady === "true"');
      if (!ready) throw new Error('La tarjeta no está lista');
      console.log('OK smoke: ventana, tarjeta, archivo e icono listos; no se probó el drop.');
      app.quit();
    }
  }).catch(error => {
    console.error(`FALLA: ${error.message}`);
    app.exit(1);
  });
  app.on('window-all-closed', () => app.quit());
}
