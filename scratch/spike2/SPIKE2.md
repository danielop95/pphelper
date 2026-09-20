# SPIKE 2 — 2026-09-20

Código desechable en `scratch/spike2/`, rama `main`, checkout
`/Users/dan/Documents/Nkrease/pphelper`. No se cambió `src/`, el manifiesto raíz
ni la continuidad compartida. Este informe contiene el relevo al coordinador.

| Punto | Veredicto | Evidencia |
| --- | --- | --- |
| 1. Append de cues y grupo nuevo | **OK** estructural; recarga **PENDIENTE** | Copia real de MEnsaje: 1 → 3 cues, 1 → 2 grupos; `Cue.encode` y `CueGroup.encode` previos idénticos. Campo desconocido inyectado también sobrevive. `out/checks.json`. Copia de biblioteca preparada con 1 cue, sin ejecutar aún el append allí. |
| 2. Drop sobre la rejilla | **PENDIENTE** manual | Procedimiento abajo, usando la demo existente. No se atribuye aceptación del drop a un smoke. |
| 3. Render HTML/PNG | **OK** como aproximación estática; comparación con ProPresenter **PENDIENTE** | Un HTML autónomo y PNG por slide de ambos archivos reales. Capturas revisadas: MEnsaje negra/vacía; Juan muestra texto blanco centrado. Tests adicionales de relleno, imagen local, Unicode y escape HTML. |
| 4. React + Untitled UI en Electron | **OK** | Build TypeScript estricto + Vite; smoke real bajo `loadFile`, sandbox y aislamiento; Button, Input y Select presentes; selección y acción verificadas, cero errores CSP. `out/ui-smoke.json`, `out/ui.png`, `out/ui-select.png`. |

## 1. Append y experimento de recarga

`append.js` exporta `append(file, slides, group)` y reutiliza el `buildPro` ya
compilado en `../../dist/src/pro.js`. Los cues nuevos usan su estilo desde cero:
1920×1080, Helvetica Neue 64, blanco centrado sobre negro; no clonan el contenido
vacío de MEnsaje. Decodifica con `discardUnknown=false`, conserva los mensajes
existentes y agrega al final un grupo nuevo con UUID propio y referencias a los
N cues nuevos. Cada ejecución agrega otro grupo, aunque el nombre sea el mismo.

Escribe primero un temporal en `scratch/spike2/out/`, comprueba de nuevo que el
archivo destino no cambió desde la lectura y lo sustituye mediante `rename`.
En esta Mac ambos directorios están en el mismo volumen; si no lo están,
`EXDEV` falla sin reemplazar el destino. No hay bloqueo cooperativo con
ProPresenter: queda una ventana de carrera entre la comprobación y el rename,
y la app podría guardar posteriormente su copia en memoria. Esto es un spike,
no un protocolo de sincronización ni una garantía de durabilidad frente a corte
eléctrico. Arreglos seleccionados/timelines previos se conservan; un arreglo
específico podría no incluir el nuevo grupo.

Solo acepta escritura dentro de este spike o en la ruta exacta
`Preestablecido/SPIKE2 copia.pro`; resuelve symlinks antes de comprobarla.
`--prepare` lee MEnsaje y crea exclusivamente la copia (`wx`, no sobrescribe),
cambiando únicamente nombre y UUID de presentación para evitar identidades
duplicadas. Cues y grupos permanecen iguales. La copia ya está creada; no es
necesario repetir ese comando.

Desde la raíz del repositorio:

```sh
# Solo si todavía no existe la copia (si existe, falla sin sobrescribir):
node scratch/spike2/append.js --prepare

# Pruebas automáticas sobre copias en out/, sin añadir cues a la copia de biblioteca:
node scratch/spike2/check.js

# Abrir primero "SPIKE2 copia" en ProPresenter y observar la rejilla de 1 slide.
# Ejecutar cuando el coordinador esté mirando esa presentación:
node scratch/spike2/append.js \
  "$HOME/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces/ProPresenter/Libraries/Preestablecido/SPIKE2 copia.pro" \
  scratch/spike2/slides.json 'Juan 3'
```

`slides.json` contiene dos textos de prueba, no traducciones de la Biblia. Para
N slides sustituir el array por N objetos `{ "label": "...", "text": "..." }`.
El resultado esperado tras una ejecución es la slide original, después dos
slides nuevas y un grupo «Juan 3». Registrar por separado: recarga inmediata,
recarga al seleccionar otra presentación y volver, recarga al reiniciar; comprobar
slides, labels y grupo. No editar/guardar simultáneamente desde ProPresenter.
El append no abre ni opera ProPresenter.

Evidencia automática de la copia real:

- Original completo SHA-256 antes y después:
  `10459dc78354934cc697c1df036e581c51d6a3181d6f251ca1a0374c1bfbfb2e`.
- Cue original reencodificado:
  `a385b1ec241b4634234a1ce42e780bde21da91d26c340ed8de16e868f06d5f89`.
- Grupo original reencodificado:
  `86481eabffbe60ce630f45291a3a20cf0aca7781b3609aa4c0a287a37a31c852`.
- Comparación binaria con `assert.deepEqual`, no solo comparación de hashes.
  Se comprueban los mensajes antes del rename y los bytes del archivo después.
- Prueba adicional con campo desconocido 19000 dentro del cue, y rechazo de
  array vacío sin modificar el destino. La igualdad se refiere a `Cue.encode`
  y `CueGroup.encode`, como exige el experimento, no al orden original de los
  campos en el wire format completo de la presentación.

### Metadatos e índices (solo lectura)

Se inspeccionaron archivos incluidos ocultos del workspace. El único candidato
con nombre `index/cache/data/db/sqlite` fue `Libraries/LibraryData`, binario con
estructura compatible con protobuf. Contenía URLs absolutas `file://` y rutas
relativas de Libraries, Preestablecido, Juan y MEnsaje. Después de crear la copia
apareció también su ruta en el mismo archivo (918 bytes al revisar); el spike
no escribió ese índice. Esto prueba descubrimiento/indexación del archivo nuevo
por la app abierta, **no** recarga de cues de una presentación ya abierta.

También existen `Playlists/Library` y `Configuration/Workspace` binarios. No se
encontró un índice separado de thumbnails/slide count en los archivos del
workspace inspeccionado. No se descarta caché en memoria u otras ubicaciones.
No hay un schema local confirmado para `LibraryData`; no se ha pretendido
reinterpretar ni escribir campos por conjetura.

```sh
rg --files --hidden \
  "$HOME/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces/ProPresenter" \
  | rg -i 'index|cache|data|db|sqlite'
strings "$HOME/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces/ProPresenter/Libraries/LibraryData"
xxd "$HOME/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces/ProPresenter/Libraries/LibraryData"
```

## 2. Arrastre a la rejilla de slides

Se reutiliza `scratch/drag-demo` sin modificarlo. El check anterior deja una
presentación de prueba con 3 cues para arrastrar:

```sh
node scratch/spike2/check.js
PRO_FILE="$PWD/scratch/spike2/out/MEnsaje-append-check.pro" \
  ./node_modules/.bin/electron scratch/drag-demo/main.js
```

1. Abrir **SPIKE2 copia** en ProPresenter, nunca MEnsaje para esta prueba.
2. Arrastrar la tarjeta de la demo hacia la **rejilla de miniaturas/slides** de
   esa presentación abierta, sobre una zona vacía o entre dos miniaturas.
3. Soltar y anotar el destino exacto, indicador de inserción y resultado:
   ¿inserta cues en la presentación abierta, importa otra presentación o rechaza?
4. Si inserta, comprobar orden, texto, labels y grupos. Anotar recuentos antes y
   después. Si no acepta, no concluir que falla el drag a playlist: son destinos
   distintos.

No se ha ejecutado este gesto; queda al coordinador/usuario según el encargo.

## 3. Render aproximado

```sh
node scratch/spike2/render/render.js \
  "$HOME/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces/ProPresenter/Libraries/Preestablecido/MEnsaje.pro"
node scratch/spike2/render/render.js \
  "$HOME/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces/ProPresenter/Libraries/Preestablecido/Juan 3.16 (NTV).pro"
./node_modules/.bin/electron scratch/spike2/render/capture.js \
  'scratch/spike2/out/MEnsaje-1-1.html' \
  'scratch/spike2/out/Juan 3.16 (NTV)-1-1.html'
```

Salida por cue/acción de slide: `nombre-cue-acción.html`, PNG del mismo nombre e
inventario `nombre-inventory.json` en `out/`. Electron usa ventana oculta de
960×540 CSS píxeles; en esta pantalla Retina el PNG es 1920×1080. Espera fuentes,
imágenes y dos frames antes de `capturePage`. Cada HTML incluye CSS y, para
imágenes, bytes embebidos: no necesita servidor, JS, red ni el archivo de imagen
original. Las fuentes dependen de las instaladas en el sistema.

El lienzo usa `aspect-ratio` y `container-type:inline-size`; bounds porcentuales
y tamaño de fuente en `cqw` escalan juntos. Respeta fondo de slide/presentación,
orden de elementos, opacidad, relleno sólido **si `fill.enable=true`**, familia,
tamaño, color y alineación horizontal/vertical. RTF → texto mediante `textutil`
de macOS, preservando Unicode/escapes; formato uniforme desde `text.attributes`
con fallback básico al primer font/tamaño/color/alineación del RTF. Imágenes
PNG/JPEG/GIF/WebP de `fill.media.url.absoluteString` con `file://` local y
`media.image` se embeben como data URI; fit/fill/stretch se aproximan con
`object-fit`. HTML escapa texto y atributos.

| Archivo | Elementos encontrados | Estilo real |
| --- | --- | --- |
| MEnsaje | 1 cue, 1 acción slide, 1 rectángulo con texto (`info=2`), sin media ni gradiente | 1920×1080; bounds 150,100,1620,880; Helvetica Neue 42, blanco, centro/medio; RTF vacío. Color sólido azul almacenado ≈ RGB(33,150,242), **relleno desactivado**. Stroke blanco 3, shadow y feather configurados pero **desactivados**. Fondo transparente mostrado sobre negro. |
| Juan 3.16 (NTV) | 1 cue, 1 acción slide, 1 texto rectangular (`info=3`), sin media ni gradiente | Bounds 192,270,1536,540; Helvetica Neue 64, blanco, centro/medio; texto del versículo; fondo negro activado; azul almacenado pero fill desactivado. |

Capturas locales:

- [MEnsaje](out/MEnsaje-1-1.png): completamente negra, coherente con RTF vacío y
  rellenos desactivados; no prueba visual de un banner.
- [Juan](<out/Juan 3.16 (NTV)-1-1.png>): texto visible, tres líneas centradas.
- [UI cerrada](out/ui.png) y [Select abierto](out/ui-select.png).

No soporta curvas/formas no rectangulares, rotación/flip, stroke/shadow/feather
activados, gradientes, vídeo/audio/live/web, rutas relativas/bookmarks de media,
efectos, márgenes/tabs/kerning exactos, múltiples estilos RTF, atributos por rango,
autoajuste de fuente, máscaras, builds, transiciones ni animación/scrollers.
`line-height:1.2` es una aproximación del navegador, no medición CoreText.
Los campos de textScroller presentes en las muestras no se animan. El fallback
RTF de estilo toma el primer valor y no es un intérprete de runs. El texto sí lo
decodifica `textutil`. La comparación fina con ProPresenter queda pendiente.

## 4. UI aislada y portabilidad

Instalación manual de fuentes reales de
[Untitled UI React](https://github.com/untitleduico/react/tree/c981a73bcd6b6c68d2a54070f20f020191212828),
commit `c981a73bcd6b6c68d2a54070f20f020191212828`. Button, Input, Select y su cierre de
imports locales están copiados sin cambiar sus implementaciones; incluye
`ui/LICENSE-UNTITLED.md` (MIT), helpers, componentes auxiliares y estilos.
No se instalaron Next.js ni Storybook. El código upstream queda en
`out/untitled-upstream` solo como referencia local ignorada.

Se consultaron [instalación](https://www.untitledui.com/react/docs/installation)
y [CLI](https://www.untitledui.com/react/docs/cli): el CLI permite `add button input
select`; se eligió la vía manual documentada para fijar un commit y copiar solo
sus imports. El comando de CLI no fue ejecutado ni se necesitó cuenta PRO.

```sh
npm ci --prefix scratch/spike2/ui
npm run build --prefix scratch/spike2/ui
npm run smoke --prefix scratch/spike2/ui
# Ventana visible:
./node_modules/.bin/electron scratch/spike2/ui/main.js
```

Versiones resueltas en el lockfile: React/React DOM **19.3.0**, Tailwind **4.3.3**,
React Aria Components **1.21.1**, Vite **8.3.0**, TypeScript **5.9.3**.
`base: './'`, alias `@` local y JSX automático; sin servidor de desarrollo.
Electron procede del `node_modules` raíz: desde `ui/` la ruta correcta es
`../../../node_modules/.bin/electron` (desde `spike2/`, `../../node_modules`).

`main.js` carga `dist/index.html` mediante `loadFile`, con `sandbox:true`,
`contextIsolation:true`, `nodeIntegration:false`, navegación y ventanas nuevas
bloqueadas. Sus datos temporales van dentro de `out/`. El preload solo publica
marcas de instrumentación DOM para comprobar sandbox/aislamiento, sin APIs Node.

CSP: `default-src 'none'`, scripts exclusivamente `'self'`, red bloqueada,
sin `unsafe-eval` ni `unsafe-inline`. React Aria 3.52.1 inyecta la regla fija de
`usePress` para touch-action; se autoriza únicamente su SHA-256
`38RhXrc7EdReTKsOm23ZPOCUgniTUUcjky8QOOrQx6o=` en `style-src`. Con CSS externo más
ese hash, abrir Select, seleccionar RVR1909 y pulsar Button pasa sin errores.
Los estilos CSSOM que React Aria asigna para colocar el popover funcionan con
esta CSP. Si cambia esa regla en una actualización hay que volver a verificar
el hash; el smoke falla ante errores de consola. No se habilitan globalmente
estilos inline para ocultar el problema.

Bundle de producción (bytes, gzip con `node:zlib`):

| Archivo | Bytes | Gzip |
| --- | ---: | ---: |
| index.html | 658 | 420 |
| JS | 504239 | 152027 |
| CSS | 84668 | 13500 |
| **Total** | **589565** | **165947** |

`out/bundle-size.json` contiene nombres exactos. Vite avisa del chunk JS >500 kB
y de directivas `use client` del upstream; no son fallos del build. Para solo
tres controles, React Aria + React tienen un coste apreciable. Se conservaron
los componentes reales para medirlo, sin una sustitución ad hoc ni splitting
especulativo. CSS incluye el tema upstream completo.

### Pasos para portar en una tarea posterior (no ejecutados)

1. Fusionar dependencias/devDependencies de `ui/package.json` con las de la raíz,
   conservando `protobufjs`, Electron y scripts existentes; instalar y conservar
   licencia MIT. No copiar `node_modules`, `dist`, el lock aislado ni `main.js`.
2. Copiar `ui/components`, `hooks`, `utils`, `styles`, `app.tsx`, `index.html` y
   `tsconfig.json` a `src/renderer/`; reemplazar la demo por la UI funcional,
   reutilizando `window.pphelper` del preload actual. El spike no porta la
   búsqueda, edición ni IPC del producto.
3. Copiar `vite.config.mts` a la raíz y ajustar `root: 'src/renderer'`, mantener
   `base: './'`, alias `@` a `fileURLToPath(new URL('./src/renderer/', import.meta.url))`,
   y `build: { outDir: '../../dist/renderer', emptyOutDir: true }`. Mantener el
   tsconfig del renderer en modo Bundler/React JSX y excluir `src/renderer` del
   tsconfig CommonJS de Electron.
4. Cambiar el script raíz de build a
   `tsc && tsc -p src/renderer/tsconfig.json --noEmit && vite build`.
   En `src/main.ts`, cambiar el `loadFile` a
   `path.join(app.getAppPath(), 'dist/renderer/index.html')`; añadir
   `dist/renderer/**/*` a `build.files` del empaquetado. Mantener sandbox,
   aislamiento y preload productivo existentes.
5. Conservar la CSP probada de `index.html`; las peticiones API.Bible continúan
   en el main por IPC, por lo que `connect-src 'none'` no impide ese flujo.
   Revalidar hash de React Aria con el lock definitivo. Pasar IDs/labels a los
   componentes para mantener el contrato del smoke productivo o actualizarlo
   junto con la migración.
6. Ejecutar `npm run build`, `npm test`, `npx electron . --smoke`, smoke específico
   de los tres controles y prueba del `.dmg` empaquetado/offline. El smoke de
   esta demo no sustituye las comprobaciones de búsqueda/edición/drag de la app.

## Verificación y continuidad para el coordinador

Ejecutadas: `node scratch/spike2/check.js`; render de ambos `.pro`; capturas con
Electron; `npm run build --prefix scratch/spike2/ui`; `npm run smoke --prefix
scratch/spike2/ui` con cero errores de consola. Se revisaron las capturas.

Se respetó la restricción de no escribir fuera del spike al comprobar la app:

```sh
npm run build -- --noEmit
npm run build -- --outDir scratch/spike2/out/root-dist
TMPDIR="$PWD/scratch/spike2/out" node --test dist/test/*.test.js
TMPDIR="$PWD/scratch/spike2/out" ./node_modules/.bin/electron . --smoke
```

Build aislado comparado byte por byte con `dist/`: idéntico en todos los JS.
Suite de la raíz: **12/12 OK**. Smoke productivo: **OK**. No se ejecutó literalmente
`npm test` porque su `tsc` escribe fuera de la carpeta permitida; se ejecutaron
sus dos partes con salida de compilación aislada y comparación de artefactos.
Los dos errores IPC esperados del smoke (clave ausente y referencia inválida)
son casos negativos del propio check, que terminó correctamente.

Realizado: código, pruebas, copia de biblioteca preparada, fuentes MIT, PNGs e
informe reproducible. `out/`, `ui/dist/` y `ui/node_modules/` están excluidos por
`.gitignore` local; PNGs permanecen disponibles en esta máquina, no en el commit.
MEnsaje se mantuvo intacto, SHA-256 registrado arriba. Solo se creó la copia
permitida fuera de `scratch/spike2/`; no se editó LibraryData.

Pendiente: coordinador observa recarga al ejecutar append, prueba drop sobre la
rejilla y compara visualmente PNGs con ProPresenter. No hay bloqueo de código.
Próximo paso: abrir «SPIKE2 copia» y ejecutar el comando de append del punto 1.
El coordinador consolidará `CONTINUIDAD.md`; este worker no modifica estado
compartido fuera de su carpeta.
