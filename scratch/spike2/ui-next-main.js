// Main + sandboxed preload: instrumentation belongs only to this isolated demo.
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
  const { createHash } = require('node:crypto');
  const out = path.join(__dirname, '../out');
  const smoke = process.argv.includes('--smoke');
  app.setPath('userData', path.join(out, 'electron-ui-next'));
  app.setPath('sessionData', path.join(out, 'electron-ui-next'));
  app.whenReady().then(async () => {
    const errors = [];
    const win = new BrowserWindow({ width: 1200, height: 820, useContentSize: true, show: !smoke,
      webPreferences: { preload: __filename, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
    win.webContents.on('render-process-gone', (_event, details) => { console.error(details); app.exit(1); });
    const timer = smoke ? setTimeout(() => { console.error('FALLA: tiempo agotado en smoke UI'); app.exit(1); }, 30000) : undefined;
    const evaluate = source => win.webContents.executeJavaScript(source);
    const waitFor = async expression => {
      for (let i = 0; i < 100; i++) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.fail(`No se cumple: ${expression}`);
    };
    const clickButton = text => evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(text)}).click()`);
    await win.loadFile(path.join(__dirname, '../../dist/renderer-next/index.html'));
    if (!smoke) return;
    await waitFor(`document.querySelectorAll('[data-slide-preview]').length === 3 && document.querySelectorAll('[data-overflow="true"]').length === 1`);
    await evaluate('document.fonts.ready');
    const state = await evaluate(`({
      node: typeof require,
      isolated: document.documentElement.dataset.isolated,
      sandboxed: document.documentElement.dataset.sandboxed,
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content,
      previews: document.querySelectorAll('[data-slide-preview]').length,
      overflow: document.querySelectorAll('[data-overflow="true"]').length,
      unsupported: document.querySelectorAll('[data-unsupported="true"]').length,
      imageLoaded: [...document.querySelectorAll('[data-slide-preview] img')].every(i => i.complete && i.naturalWidth > 0),
      normalTextFits: !document.querySelector('[data-slide-preview]').querySelector('[data-overflow]'),
      dashed: getComputedStyle(document.querySelector('[data-unsupported]'), '::after').outlineStyle,
    })`);
    assert.equal(state.node, 'undefined');
    assert.equal(state.isolated, 'true');
    assert.equal(state.sandboxed, 'true');
    assert.equal(state.previews, 3);
    assert.equal(state.overflow, 1);
    assert.equal(state.unsupported, 1);
    assert.equal(state.imageLoaded, true);
    assert.equal(state.normalTextFits, true);
    assert.equal(state.dashed, 'dashed');
    assert(!state.csp.includes('unsafe-'));
    assert(state.csp.includes("connect-src 'none'"));

    // Re-measure on resizing and clear the flag when the text fits again.
    const overflowBox = `document.querySelectorAll('[data-slide-preview]')[2].querySelector('[data-role="verse"]')`;
    await evaluate(`${overflowBox}.style.height = '65%'`);
    await waitFor(`!${overflowBox}.hasAttribute('data-overflow')`);
    await evaluate(`${overflowBox}.style.height = '${70 / 1080 * 100}%'`);
    await waitFor(`${overflowBox}.dataset.overflow === 'true'`);
    const fontSize = await evaluate(`parseFloat(getComputedStyle(document.querySelector('.slide-preview-text')).fontSize)`);
    win.setContentSize(960, 820);
    await waitFor(`parseFloat(getComputedStyle(document.querySelector('.slide-preview-text')).fontSize) !== ${fontSize}`);
    win.setContentSize(1200, 820);

    await evaluate(`document.querySelector('button[aria-haspopup="listbox"]').click()`);
    await waitFor(`document.querySelectorAll('[role="option"]').length === 2`);
    await evaluate(`document.querySelectorAll('[role="option"]')[1].click()`);
    await clickButton('Preparar slides');
    await waitFor(`document.querySelector('[role="status"]').textContent === 'Preparado: Salmos 23:1 · NTV'`);
    await clickButton('Ajustes');
    await waitFor(`!!document.querySelector('[role="dialog"] input[type="checkbox"]')`);
    await evaluate(`document.querySelector('[role="dialog"] input[type="checkbox"]').click()`);
    assert.equal(await evaluate(`document.querySelector('[role="dialog"] input[type="checkbox"]').checked`), false);
    await clickButton('Cerrar ajustes');
    await waitFor(`!document.querySelector('[role="dialog"]')`);
    await evaluate(`document.querySelectorAll('[role="tab"]')[1].click()`);
    await waitFor(`document.querySelectorAll('[role="tab"]')[1].getAttribute('aria-selected') === 'true'`);
    await evaluate(`document.querySelectorAll('[role="tab"]')[0].click()`);
    await waitFor(`document.querySelectorAll('[data-slide-preview]').length === 3`);
    win.show();
    win.focus();
    await waitFor(`document.hasFocus()`);
    await evaluate(`document.querySelector('[role="tabpanel"]').focus()`);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
    await waitFor(`document.activeElement.textContent === 'Acerca de la vista previa'`);
    await waitFor(`!!document.querySelector('[role="tooltip"]')`);
    await evaluate(`document.activeElement.blur()`);
    await waitFor(`!document.querySelector('[role="tooltip"]')`);

    // Validate the exact styles injected by the final dependency lock against the CSP.
    const styles = await evaluate(`[...document.querySelectorAll('style')].map(s => s.textContent).filter(Boolean)`);
    assert(styles.length > 0, 'No se encontró la regla de React Aria');
    const hashes = [...new Set(styles.map(css => `sha256-${createHash('sha256').update(css).digest('base64')}`))];
    for (const hash of hashes) assert(state.csp.includes(`'${hash}'`), `Hash CSS no autorizado: ${hash}`);
    await evaluate('Promise.all(document.getAnimations().map(a => a.finished.catch(() => {})))');
    assert.deepEqual(errors, []);
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(path.join(out, 'ui-next.png'), (await win.webContents.capturePage()).toPNG());
    const result = { ...state, hashes, errors, controls: true, overflowResize: true, scale: true };
    await fs.writeFile(path.join(out, 'ui-next-smoke.json'), JSON.stringify(result, null, 2));
    console.log('OK smoke renderer-next:', JSON.stringify(result));
    clearTimeout(timer);
    app.quit();
  }).catch(error => { console.error('FALLA:', error); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
}
