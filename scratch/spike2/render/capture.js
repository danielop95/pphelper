const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const out = path.join(__dirname, '../out/electron-render');
app.setPath('userData', out);
app.setPath('sessionData', out);
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  for (const file of process.argv.slice(2)) {
    const window = new BrowserWindow({ width: 960, height: 540, useContentSize: true, show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    await window.loadFile(path.resolve(file));
    const size = await window.webContents.executeJavaScript(`({width:Number(document.querySelector('.slide').dataset.width),height:Number(document.querySelector('.slide').dataset.height)})`);
    window.setContentSize(960, Math.round(960 * size.height / size.width));
    await window.webContents.executeJavaScript('document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.decode()))).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))');
    const png = (await window.webContents.capturePage()).toPNG();
    await fs.writeFile(file.replace(/\.html$/, '.png'), png);
    console.log('PNG:', file.replace(/\.html$/, '.png'), png.length);
    window.destroy();
  }
  app.quit();
}).catch(e => { console.error('FALLA:', e); app.exit(1); });
