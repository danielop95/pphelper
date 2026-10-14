import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { refAssist } from '../src/books';

test('refAssist sugiere libros por nombre, alias y sin tildes', () => {
  assert.equal(refAssist('jn').suggestions[0].id, 'Juan ');
  assert.deepEqual(refAssist('genesis').suggestions, [{ id: 'Génesis ', label: 'Génesis' }]);
  assert.deepEqual(refAssist('1 j').suggestions.map(s => s.label), ['1 Juan']);
  assert.ok(refAssist('s').suggestions.length <= 8);
  assert.deepEqual(refAssist('Génesis ').suggestions, []);
  assert.deepEqual(refAssist(''), { suggestions: [], hint: '', invalid: false });
  assert.deepEqual(refAssist('desconocido'), { suggestions: [], hint: '', invalid: false });
});

test('refAssist avisa de capítulos y versículos fuera de la Biblia local', () => {
  const outline = { JHN: [51, 25, 36], MAT: [25, 0] };
  assert.deepEqual(refAssist('Juan 3:16', outline), { suggestions: [], hint: 'Juan 3: 36 versículos', invalid: false });
  assert.equal(refAssist('jn 3:', outline).invalid, false);
  assert.equal(refAssist('Juan 3:16-', outline).invalid, false);
  assert.deepEqual(refAssist('Juan 30', outline), { suggestions: [], hint: 'Juan tiene 3 capítulos.', invalid: true });
  assert.equal(refAssist('Juan 3:37', outline).hint, 'Juan 3 tiene 36 versículos.');
  assert.equal(refAssist('Juan 3:30-99', outline).invalid, true);
  assert.equal(refAssist('Mateo 2', outline).invalid, true);
  assert.equal(refAssist('Génesis 1', outline).hint, 'Génesis no está en esta Biblia.');
  assert.equal(refAssist('Juanito 3', outline).invalid, true);
  assert.deepEqual(refAssist('Juan 30', null), { suggestions: [], hint: '', invalid: false });
});
