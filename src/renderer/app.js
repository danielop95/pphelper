'use strict';
const api = window.pphelper;
const $ = selector => document.querySelector(selector);
let config;
let slides = [];
let loadedRef = '';
let versionForSlides = '';
let revision = 0;
let readyFile = null;
let buildTimer;
let bibles = [];

function error(message) {
  $('#error').textContent = String(message?.message || message || '').replace(/^Error invoking remote method '[^']+': Error: /, '');
  $('#error').hidden = !$('#error').textContent;
}
function status(message) { $('#status').textContent = message; }
function invalidate() {
  clearTimeout(buildTimer);
  revision++;
  readyFile = null;
  $('#drag-card').draggable = false;
  $('#drag-card').setAttribute('aria-disabled', 'true');
  $('#send-library').disabled = true;
  $('#drag-filename').textContent = slides.length ? 'Preparando archivo…' : 'El archivo aparecerá aquí';
  return revision;
}
function scheduleBuild() {
  if (!slides.length) return;
  const current = invalidate();
  if (!slides.length || !loadedRef || versionForSlides !== $('#version').value) return;
  status('Generando presentación…');
  buildTimer = setTimeout(async () => {
    try {
      const file = await api.buildAndDrag({ ref: loadedRef, versionKey: versionForSlides, template: $('#template').value, slides });
      if (current !== revision || !file) return;
      readyFile = file;
      $('#drag-card').draggable = true;
      $('#drag-card').setAttribute('aria-disabled', 'false');
      $('#send-library').disabled = false;
      $('#drag-filename').textContent = file.name;
      error('');
      status(`${slides.length} diapositiva${slides.length === 1 ? '' : 's'} lista${slides.length === 1 ? '' : 's'}.`);
    } catch (reason) {
      if (current !== revision) return;
      $('#drag-filename').textContent = 'Revisa el error para generar el archivo';
      status('No se pudo generar la presentación.'); error(reason);
    }
  }, 300);
}
function renderSlides() {
  $('#slides').replaceChildren();
  $('#empty').hidden = slides.length > 0;
  $('#slide-count').textContent = slides.length;
  slides.forEach((slide, index) => {
    const row = document.createElement('div'); row.className = 'slide';
    const label = document.createElement('label'); label.htmlFor = `slide-${index}`; label.textContent = slide.label;
    const area = document.createElement('textarea'); area.id = label.htmlFor; area.value = slide.text; area.rows = 3;
    area.addEventListener('input', () => { slides[index].text = area.value; scheduleBuild(); });
    const actions = document.createElement('div'); actions.className = 'slide-actions';
    const merge = document.createElement('button'); merge.type = 'button'; merge.textContent = 'Unir con siguiente'; merge.dataset.merge = index; merge.disabled = index === slides.length - 1;
    const split = document.createElement('button'); split.type = 'button'; split.textContent = 'Partir aquí'; split.dataset.split = index;
    split.title = 'Coloca el cursor en el texto donde quieres dividir';
    async function edit(position) {
      const current = invalidate();
      try {
        const next = await api.editSlides(slides, index, position);
        if (current !== revision) return;
        slides = next; renderSlides(); scheduleBuild();
        $(`#slide-${index}`).focus();
      } catch (reason) { if (current === revision) { scheduleBuild(); error(reason); } }
    }
    merge.addEventListener('click', () => edit());
    split.addEventListener('click', () => {
      if (area.selectionStart <= 0 || area.selectionStart >= area.value.length) { error('Coloca el cursor dentro del texto para partir la diapositiva.'); area.focus(); return; }
      edit(area.selectionStart);
    });
    actions.append(merge, split); row.append(label, area, actions); $('#slides').append(row);
  });
}
async function lookup() {
  slides = []; loadedRef = ''; renderSlides();
  const current = invalidate();
  const version = $('#version').value;
  $('#search').disabled = true;
  status('Buscando pasaje…'); error('');
  try {
    const result = await api.lookup($('#reference').value, version);
    if (current !== revision) return;
    slides = result.slides; loadedRef = result.ref; versionForSlides = version;
    renderSlides(); scheduleBuild();
  } catch (reason) {
    if (current !== revision) return;
    error(reason); status('No se pudo consultar el pasaje.');
  } finally { $('#search').disabled = false; }
}
function options(select, entries, emptyLabel) {
  const previous = select.value;
  select.replaceChildren();
  if (emptyLabel) select.add(new Option(emptyLabel, ''));
  for (const name of entries) select.add(new Option(name, name));
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
}
async function refreshConfig() {
  config = await api.getConfig();
  options($('#version'), Object.keys(config.versions), Object.keys(config.versions).length ? null : 'Configura una Biblia');
  options($('#template'), Object.keys(config.templates), 'Sin plantilla');
  $('#api-key').value = config.apiBibleKey;
  $('#max-chars').value = config.maxChars;
  $('#library-path').value = config.libraryPath || '';
  if (config.error) error(config.error);
}
function renderBibles() {
  $('#bible-list').replaceChildren();
  const available = bibles.length ? bibles : Object.entries(config.versions).map(([key, id]) => ({ key, id, name: key }));
  if (!available.length) { $('#bible-list').textContent = 'Carga la lista para elegir versiones en español.'; return; }
  for (const bible of available) {
    const label = document.createElement('label');
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = Object.values(config.versions).includes(bible.id);
    const text = document.createElement('span'); text.textContent = `${bible.key} · ${bible.name}`;
    input.addEventListener('change', async () => {
      $('#bibles').disabled = true;
      const previousVersion = $('#version').value;
      try {
        const versions = { ...config.versions };
        for (const [key, id] of Object.entries(versions)) if (id === bible.id) delete versions[key];
        if (input.checked) {
          let key = bible.key;
          for (let n = 2; Object.hasOwn(versions, key); n++) key = `${bible.key} ${n}`;
          versions[key] = bible.id;
        }
        config = await api.setConfig({ versions });
        await refreshConfig(); renderBibles(); error('');
        if (loadedRef && previousVersion !== $('#version').value) await lookup();
        else status('Biblias guardadas.');
      } catch (reason) { input.checked = !input.checked; error(reason); }
      finally { $('#bibles').disabled = false; }
    });
    label.append(input, text); $('#bible-list').append(label);
  }
}
$('#lookup-form').addEventListener('submit', event => { event.preventDefault(); lookup(); });
$('#version').addEventListener('change', () => { if ($('#reference').value.trim()) lookup(); else invalidate(); });
$('#template').addEventListener('change', scheduleBuild);
$('#drag-card').addEventListener('dragstart', event => {
  event.preventDefault();
  if (readyFile) api.buildAndDrag(readyFile.revision);
});
$('#send-library').addEventListener('click', async () => {
  if (!readyFile) return;
  $('#send-library').disabled = true;
  try { await api.sendToLibrary(readyFile.revision); error(''); status('Enviado a la biblioteca de ProPresenter.'); }
  catch (reason) { error(reason); }
  finally { $('#send-library').disabled = !readyFile; }
});
$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const changedLimit = config.maxChars !== Number($('#max-chars').value);
    await api.setConfig({ apiBibleKey: $('#api-key').value.trim(), maxChars: Number($('#max-chars').value), libraryPath: $('#library-path').value.trim() });
    await refreshConfig(); error(''); status('Ajustes guardados.');
    if (changedLimit && loadedRef) await lookup();
  } catch (reason) { error(reason); }
});
$('#load-bibles').addEventListener('click', async () => {
  $('#load-bibles').disabled = true; error(''); status('Cargando Biblias en español…');
  try {
    config = await api.setConfig({ apiBibleKey: $('#api-key').value.trim() });
    bibles = await api.listBibles(); renderBibles(); status('Marca las Biblias que quieras usar.');
  } catch (reason) { error(reason); status('No se pudieron cargar las Biblias.'); }
  finally { $('#load-bibles').disabled = false; }
});
$('#choose-library').addEventListener('click', async () => {
  try { const next = await api.chooseLibrary(); if (next) { config = next; $('#library-path').value = config.libraryPath; error(''); status('Carpeta de biblioteca guardada.'); } }
  catch (reason) { error(reason); }
});
$('#add-template').addEventListener('click', async () => {
  $('#add-template').disabled = true;
  try {
    const next = await api.addTemplate();
    if (next) { await refreshConfig(); $('#template').value = Object.keys(next.templates).at(-1); error(''); status('Plantilla añadida.'); scheduleBuild(); }
  } catch (reason) { error(reason); }
  finally { $('#add-template').disabled = false; }
});
api.onDragError(error);
refreshConfig().then(() => {
  renderBibles();
  $('#settings').open = !Object.keys(config.versions).length;
  if (Object.keys(config.versions).length) status('Escribe una referencia y pulsa Enter.');
  document.documentElement.dataset.ready = 'true';
}).catch(error);
