# Continuidad

Plan vigente: `~/.claude/plans/contexto-en-mi-iglesia-majestic-corbato.md` (fase 1.6, ejecutada). Fases 2 y 3 sin plan.

## 2026-10-14

Realizado: autocompletado en «Referencia bíblica». Plan: `~/.claude/plans/vamos-a-lanzar-una-cozy-shore.md`.
- `src/books.ts` (puro) con `BOOKS`/`parseRef`/`formatRef` movidos de `bible.ts` y `refAssist`: sugiere libros por nombre/alias sin tildes; con Biblia local avisa en vivo de capítulo/versículo inexistente y deshabilita Buscar.
- IPC `bibles:outline` → `bibleOutline` (máx. `verse_end` por capítulo). Con API.Bible solo sugiere libros.
- Campo hecho con `ComboBox` de react-aria + `InputBase` de Untitled (el `ComboBox` de Untitled usa texto transparente superpuesto que chocaba con el CSS oscuro).

Verificado: build, test 36/36, smoke OK 3 veces (sugerencia «gen», ↓+Enter completa «Génesis », «Génesis 99» deshabilita Buscar). Capturas `scratch/out/f17-*.png`.

Hecho no obvio: en el smoke el ComboBox solo abre con teclas reales (`sendInputEvent` + `win.focus()`), no con el setter de `value`.

- Ajustes → Biblias sin conexión: botón «Descargar Biblias XML» abre `https://github.com/Beblia/Holy-Bible-XML-Format` (IPC `app:open-bibles`, URL fija en main).

Publicado: commits `a3d04a3` (feature) y `8355b95` (versión 0.2.3) en `main`; release `v0.2.3` con `pphelper-0.2.3-arm64.dmg` (no borrador).

Pendiente: prueba manual en la app real con RVR1960 (autocompletado, aviso de límites, botón de descarga); confirmar que la 0.2.2 instalada avisa de la 0.2.3.

## 2026-09-26

Realizado (en `main`, publicado en https://github.com/danielop95/pphelper, público):
- Bug: ProPresenter guarda un texto RTF vacío en TODOS los elementos, también imágenes. Un fondo PNG a lienzo completo ganaba por área y recibía el versículo. `textElement`/`readSlideModel` prefieren cajas sin `fill.media` (si no hay otra, usan la de imagen).
- Selector manual de caja Versículo/Cita por plantilla (`Config.templateRoles`, índices en `SlideModel.elements`); aplica a vista previa, generar y añadir.
- Aviso de versión nueva: al abrir consulta `releases/latest` de GitHub y ofrece abrir la página. Sin firma no hay auto-instalación.
- Versión 0.2.0, release `v0.2.0` con el `.dmg` arm64.
- 0.2.1: aviso en Ajustes cuando plantillas y envíos comparten biblioteca (causa del "ruido": cada `.pro` de 1 slide enviado aparecía como plantilla). Solución recomendada al usuario: biblioteca de ProPresenter solo para plantillas. Release `v0.2.1` publicada con `.dmg`.
- Hecho no obvio: el DNS de Tailscale (`100.100.100.100`) falla a ratos con `api.github.com`; una subida de release falló por eso y dejó un borrador vacío (se borró y se repitió).

Verificado: build, test 34/34, smoke OK. Plantilla real `Versiculos.pro` (Preestablecido): usuario confirmó en ProPresenter `Prueba fix.pro` y `Prueba fix 2.pro` bien.

Decisiones: Biblias solo por importación manual (sin preinstalar por licencias). Actualización sin firma (camino 1); firmar requiere Apple Developer.

Pendiente:
- Usuario: crear biblioteca solo de plantillas, mover `Versiculos.pro` y elegirla en Ajustes.
- Confirmar en la 0.2.0 instalada que aparece el aviso de la 0.2.1; probar el selector manual de cajas en la UI real.
- Publicar una versión: subir `version` en `package.json`, `npm run dist`, `gh release create vX.Y.Z out/pphelper-X.Y.Z-arm64.dmg`.

## 2026-09-20

Realizado (todo en `main`):
- Fase 1: app Electron que genera `.pro` de versículos, arrastre a playlist (probado por el usuario) y "Enviar a biblioteca".
- Fase 1.5: renderer React + Tailwind + Untitled UI; cortes automáticos equilibrados con límites por plantilla y botón Reorganizar; plantillas sincronizadas desde una biblioteca de ProPresenter con selector gráfico y vista previa por slide; referencia en el segundo texto de la plantilla; clonado de plantillas con texto vacío.
- Fase 1.6: Biblias sin conexión en SQLite (`src/bibledb.ts`, `node:sqlite`, `userData/bibles.db`) con importador XML formato Beblia; versículos agrupados (`verseEnd`, label de rango); "Añadir a presentación…" (`appendToPro`: copia de seguridad en `userData/backups`, escritura atómica, detección de cambio concurrente); tema oscuro con acento naranja; logo e icono de la app; arreglo de carrera en campos mín/máx (`LimitFields`).
- Instalador: `out/pphelper-0.1.0-arm64.dmg` (~140 MB, sin firma: clic derecho → Abrir), con `icon.icns` nuevo.

Verificado esta sesión:
- `npm run build`, `npm test` (34), `npx electron . --smoke` 5/5 (el worker reporta 10/10).
- Import real dentro de Electron: RVR1960 (31 104), NVI (31 127), TLA (26 541 filas, 3 535 agrupados), PDT (31 071); ~100 ms cada una; base 21 MB.
- App real sin clave de API.Bible: `Juan 3:16-18` en las cuatro; TLA `Génesis 2:1-4` → labels `Génesis 2:1-3 | Génesis 2:4`; `1 Crónicas 6` en TLA → mensaje claro.
- `appendPro` real sobre `SPIKE2 copia`: backup creado, 9 cues previos byte-idénticos, grupo nuevo `Salmos 23`, sin temporales, `MEnsaje.pro` intacto (sha256 `10459dc7…`).
- Icono `.icns` empaquetado revisado visualmente.
- "Añadir a presentación" confirmado en ProPresenter 21.4 tras reinicio (cerrado por el usuario): `SPIKE2 copia` muestra 11 slides, la 10 es `Salmos 23:1-3` NVI añadida desde la app, previas intactas. Nota: ProPresenter pide confirmación al salir; el cierre por AppleScript no es fiable.

Hechos no obvios:
- ProPresenter lee un `.pro` del disco solo la PRIMERA vez que se abre esa presentación en la sesión (probado: cerrado → aparece; abierto sin haberla seleccionado → aparece; ya abierta antes → no se actualiza hasta reiniciar). No acepta archivos soltados en la rejilla de slides. Si guarda después su copia en memoria, puede pisar lo añadido.
- API.Bible con la clave del usuario solo concede en español NTV, RVR1909, PDT-ti, VBL, BES: es licencia, no capacidad.
- XML Beblia: TLA agrupa versículos (vacíos = parte del anterior) y trae vacíos de origen 1 Crónicas 6, 1 Crónicas 26 e Isaías 38. Los NT solos numeran libros 40-66.
- Los textos bíblicos nunca se commitean ni se empaquetan (`scratch/bibles/` y `*.bible.xml` ignorados).
- El smoke fallaba ~1 de 4 por comparar contra estado de React obsoleto en `LimitFields`; ahora lee los inputs.

Pendiente:
- Borrar `SPIKE2 copia.pro` de `Preestablecido` tras esa verificación (con confirmación del usuario).
- Banner real de la iglesia como plantilla para validar el clonado con diseño real.
- Instalar el `.dmg` en una Mac limpia.
- Fase 2 (montaje online del servicio + sync entre Macs) y fase 3 (modo en vivo por API REST).

Próximo paso: el usuario instala el `.dmg`, importa sus XML en Ajustes → Biblias sin conexión y prueba "Añadir a presentación" antes de abrir ProPresenter.
