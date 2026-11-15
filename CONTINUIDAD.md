# Continuidad

Plan vigente: `~/.claude/plans/contexto-en-mi-iglesia-majestic-corbato.md` (fase 1.6, ejecutada). Fases 2 y 3 sin plan.

## 2026-11-15 (tarde)

Realizado: ventana inicial 560 px; actualización desde la app (`src/update.ts`): `pickAsset` (asset `pphelper-<v>-<arch>.dmg` del repo con `digest` sha256 de la API de GitHub), descarga en streaming con SHA-256, `hdiutil attach` + `ditto`, validación de `Info.plist` y `SWAP_SCRIPT` (`/bin/sh` separado: espera el PID, `mv` con restauración, `open`). Banner: «Actualizar ahora» + «Ver novedades». Editor de plantilla ya no se cierra con clic fuera (se perdía el trabajo). README al día.

Verificado: test 45/45, smoke OK; prueba real de punta a punta: copia empaquetada como 0.2.3 en el scratchpad → el usuario pulsó «Actualizar ahora» → se reabrió como 0.2.4 desde la misma ruta, sin atributo de cuarentena, idéntica a la app del `.dmg`, sin temporales.

Hechos no obvios:
- El primer clic en un botón no puede quitar el bloqueo de Gatekeeper de la primera apertura; la descarga hecha por la propia app no lleva cuarentena.
- La herramienta Bash mata los procesos lanzados en segundo plano al terminar; para dejar una app abierta usar `open -n`. La app empaquetada no abre `--remote-debugging-port`.
- `codesign --verify` da «code has no resources…» también en el `.dmg` original (firma ad hoc de electron-builder); no impide abrir.

## 2026-11-15

Realizado (sin commit): plantillas importadas dentro de la app. Plan: `~/.claude/plans/actualmente-la-app-esta-curried-bird.md`.
- `importTemplate` (`src/library.ts`) + `localizeTemplate` (`src/pro.ts`): valida 1 slide y cajas de texto, copia los medios a `userData/plantillas/media/<nombre>/` y reescribe `absoluteString`; `local` (ROOT_SHOW) se conserva. Acepta `.proBundle` (zip, se extrae con `ditto`).
- UI: «Importar…» en la sección Plantilla, «Quitar plantilla» con confirmación. Ajustes ya no tiene «Biblioteca de plantillas»; IPC `libraries:list` eliminado.
- Migración única al arrancar: si no existe `userData/plantillas` y hay `templateLibrary`, se importan sus `.pro` de 1 slide.
- Arreglos: generación obsoleta devuelve `null` en vez de error; quitar la plantilla seleccionada la deselecciona sin generar con la borrada.

Verificado: build, test 40/40, smoke OK 3/3; import real de `~/Downloads/VERSICULOS.probundle` y de `PANTILLAS/VERSICULOS.pro` a carpeta temporal con fondo en la vista previa.

Hechos no obvios:
- ProPresenter 22.0.1 (migró el 2026-11-15 13:03) guarda las presentaciones en `Workspaces/<uuid>/DocumentStore/workspace-v1.sqlite3` (snapshots Loro/CRDT), NO como `.pro` en `Libraries/`. `UserWorkspaces/ProPresenter/Libraries` quedó congelado como legado.
- Los `.pro` exportados por PP22 (sueltos o dentro de `.proBundle`) referencian medios solo con `local {root: ROOT_SHOW, path: "Media/Assets/..."}`, sin `absoluteString`; la vista previa antigua no los resolvía.

Además (mismo día, sin commit): plantilla desde imagen. El usuario quiere subir el banner PNG (p. ej. `~/Downloads/IMG_4410.PNG`, franja granate inferior transparente arriba) en vez de un `.pro`.
- «Desde imagen…» → `templates:pick-image` (main guarda la ruta; `defaultBoxes` detecta la banda opaca más alta) → `TemplateEditor` (cajas arrastrables, fuente/tamaño/color/alineación) → `templates:create` → `createTemplate`/`buildTemplate` ([versículo, cita, imagen], slide transparente) y `templateRoles[nombre] = {verse: 0, reference: 1}`.
- Permiso `local-fonts` concedido solo a la ventana principal (el resto sigue denegado).
- Verificado: test 42/42, smoke 4/4 (diálogo simulado, fuentes > 0, arrastre real con `sendInputEvent`, guardar, quitar por UI). Banner real: banda desde y=757, versículo 192,783 1574×216.

Usuario confirmó: plantilla desde imagen se ve bien en ProPresenter 22 (arrastre a playlist).

Además (mismo día, sin commit): ajuste general de UI (plan en el mismo archivo de plan).
- `FontPicker` (TemplateEditor): ComboBox react-aria + `Virtualizer`/`ListLayout`, cada opción escrita con su fuente vía `FontFace('pp-<postscript>', local(...))` (la CSP lo permite). `menuTrigger="focus"`, chevron decorativo.
- Botón primario: texto `text-primary_on-brand` (#1e1e1e). Causa real del texto claro: `.section-heading span` pintaba la etiqueta de los botones del encabezado; acotado a `.section-heading h2 span`. Smoke mide contraste de la etiqueta (≥4.5).
- Glosario simple (Pasaje, Biblia, Buscar pasaje, Repartir de nuevo, Letras por diapositiva, Eliminar…), iconos y botones `secondary` en vez de `tertiary`.
- «Enviar a biblioteca» y «Agregar a una presentación» ocultos salvo `config.legacyDelivery` (Ajustes → «Uso ProPresenter 21 o anterior»).
- Verificado: test 42/42, smoke 3/3 (+ contraste, selector abre con clic real, filtra «georgia», fuente cargada), `impeccable detect` limpio.
- Hecho no obvio (smoke): el primer clic real tras abrir un modal solo activa la ventana; y hay que esperar a que el popover termine de recolocarse antes de clicar una opción.

Publicado: commits `f18a8db` (feature) y `4906c10` (versión 0.2.4) en `main`; release `v0.2.4` con `pphelper-0.2.4-arm64.dmg` (no borrador, 139 836 202 bytes). El primer `npm run dist` falló con `plistlib.InvalidFileException`; el segundo funcionó (había una pphelper abierta desde `out/mac-arm64`).

Pendiente:
- Instalar 0.2.4 en la Mac de la iglesia; confirmar que la 0.2.3 avisa de la versión nueva.
- Editar después una plantilla creada desde imagen (hoy se recrea con el mismo nombre).
- Probable rotura con PP22 de «Enviar a biblioteca» y «Añadir a presentación» (escriben `.pro` en `UserWorkspaces/.../Libraries`, que PP22 ya no lee). Sin verificar.
- Commit y versión nueva cuando el usuario lo pida.

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
