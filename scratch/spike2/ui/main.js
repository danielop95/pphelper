// Proceso principal y preload sandboxed: instrumentación exclusiva del smoke.
if (process.type === 'renderer') {
  window.addEventListener('DOMContentLoaded', () => {
    document.documentElement.dataset.isolated = String(process.contextIsolated);
    document.documentElement.dataset.sandboxed = String(process.sandboxed);
  });
} else {
  const { app, BrowserWindow } = require('electron');
  const fs = require('node:fs/promises');
  const path = require('node:path');
  const assert = require('node:assert/strict');
  const out = path.join(__dirname, '../out');
  app.setPath('userData', path.join(out, 'electron-ui'));
  app.setPath('sessionData', path.join(out, 'electron-ui'));
  const smoke = process.argv.includes('--smoke');
  app.whenReady().then(async () => {
    const errors = [];
    const win = new BrowserWindow({ width: 860, height: 680, useContentSize: true, show: !smoke,
      webPreferences: { preload: __filename, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
    await win.loadFile(path.join(__dirname, 'dist/index.html'));
    if (!smoke) return;
    const inspect = () => win.webContents.executeJavaScript(`({
      input: !!document.querySelector('input'),
      select: !!document.querySelector('button[aria-haspopup="listbox"]'),
      button: [...document.querySelectorAll('button')].some(b => b.textContent === 'Preparar slides'),
      node: typeof require,
      isolated: document.documentElement.dataset.isolated,
      sandboxed: document.documentElement.dataset.sandboxed,
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content
    })`);
    let state;
    for (let i = 0; i < 100; i++) {
      state = await inspect();
      if (state.input && state.select && state.button) break;
      await new Promise(r => setTimeout(r, 50));
    }
    assert(state.input && state.select && state.button, JSON.stringify(state));
    assert.equal(state.node, 'undefined');
    assert.equal(state.isolated, 'true');
    assert.equal(state.sandboxed, 'true');
    assert(!state.csp.includes('unsafe-eval'));
    await win.webContents.executeJavaScript(`document.querySelector('button[aria-haspopup="listbox"]').click()`);
    await new Promise(r => setTimeout(r, 200));
    assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('[role="option"]').length`), 2);
    await fs.mkdir(out, { recursive: true });
    await win.webContents.executeJavaScript('Promise.all(document.getAnimations().map(a => a.finished.catch(() => {})))');
    await fs.writeFile(path.join(out, 'ui-select.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.querySelectorAll('[role="option"]')[1].click()`);
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Preparar slides').click()`);
    await new Promise(r => setTimeout(r, 200));
    assert.match(await win.webContents.executeJavaScript(`document.querySelector('[role="status"]').textContent`), /^Preparado: Juan 3:16 · RVR09$/);
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(out, 'ui.png'), (await win.webContents.capturePage()).toPNG());
    const result = { ...state, errors, selectOptions: 2, buttonAction: true };
    await fs.writeFile(path.join(out, 'ui-smoke.json'), JSON.stringify(result, null, 2));
    console.log('OK smoke UI:', JSON.stringify(result));
    app.quit();
  }).catch(e => { console.error('FALLA:', e); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
}
