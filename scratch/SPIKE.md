# Spike OLA 1 — 2026-09-20

Código desechable en `scratch/`, rama `main`, checkout
`/Users/dan/Documents/Nkrease/pphelper`. Sin cambios en `src/`, dependencias ni
configuración de compilación. Este informe sirve de relevo al coordinador para
consolidar la continuidad compartida.

| Punto | Veredicto | Evidencia y límite |
| --- | --- | --- |
| 1. Generar `.pro` | **OK** estructural | `node scratch/gen-pro.js` crea el archivo, lo vuelve a decodificar y comprueba dos slides con sus labels; la importación y apariencia en ProPresenter siguen **PENDIENTES**. |
| 2. Clonar el banner | **PENDIENTE** | No existe `scratch/reference.pro`; el script está listo y pasa comprobaciones con una referencia sintética y una slide del ejemplo de upstream, no con el diseño del usuario. |
| 3. Arrastre nativo | **PENDIENTE** | Demo preparada; smoke de Electron correcto con preload aislado, tarjeta draggable, archivo e icono. Falta soltar en playlist y librería de ProPresenter. |
| 4. API.Bible | **PENDIENTE** | `API_BIBLE_KEY` no está definida; se verificaron el manejo de su ausencia y el contrato HTTP con respuestas simuladas, sin consulta autenticada. |

## 1. Generación desde cero

Desde la raíz del proyecto:

```sh
node scratch/gen-pro.js
node scratch/check-spike.js
```

Resultados locales regenerables, ignorados por git:

- `scratch/out/Juan 3.16-17.pro`.
- `scratch/out/decoded.json`: dos `cues`; cada uno tiene una acción de slide,
  un elemento de texto y `actions[0].label.text` igual a `Juan 3:16` o `Juan 3:17`.
- RTF de 64 pt, Helvetica Neue, blanco, centrado horizontal y verticalmente;
  lienzo 1920×1080, fondo negro y caja en x=192, y=270, 1536×540.
- Texto de muestra de Reina-Valera 1909, de dominio público; no representa una
  respuesta de API.Bible ni se presenta como RVR1960.

`protobufjs` valida y decodifica el resultado. `textutil` de macOS convirtió los
dos RTF a texto plano con igualdad exacta de los versículos, incluidos acentos.
Esto demuestra estructura y legibilidad del RTF, no aceptación por ProPresenter.

Referencias estudiadas, clonadas sin instalar sus dependencias ni ejecutarlas:

- [bevanjkay/propresenter-presentation-builder, commit dac8e5d](https://github.com/bevanjkay/propresenter-presentation-builder/tree/dac8e5d49b0cebd59ff53f4630b41fb7d6823147):
  `src/propresenter/buildPresentation.ts`, `rtf.ts`, `layouts.ts` y `Template.pro`.
  Aporta la estructura cue → action (tipo 11) → presentation → baseSlide →
  elements y la ubicación del label en `Action.label.text`.
- [Joelkott/pro-file-generator, commit c31cc16](https://github.com/Joelkott/pro-file-generator/tree/c31cc16d2187fdc53c11e8147c544fa4a39297df):
  `txt_to_pro.py`; clona cues de una plantilla, renueva UUIDs y conserva partes
  del RTF. Su reconstrucción de RTF como último recurso puede cambiar el estilo;
  este spike rechaza los formatos no soportados.

Ambos checkouts están en `scratch/ref-repos/`, excluidos del commit. Se escribió
solo el código necesario con el `protobufjs` ya instalado y los protos 7.16.2
locales; no se copiaron sus implementaciones completas.

## 2. Clonación de una slide

Exportar una presentación de **una sola slide** a `scratch/reference.pro`:

```sh
node scratch/clone-slide.js
```

El resultado es `scratch/out/cloned.pro`, con JSON decodificado en
`scratch/out/cloned-decoded.json`. Por defecto contiene los dos textos de muestra.
Para N slides, crear `scratch/verses.local.json` con un array de N objetos:

```json
[
  { "label": "Juan 3:16", "text": "Primer texto" },
  { "label": "Juan 3:17", "text": "Segundo texto" }
]
```

```sh
node scratch/clone-slide.js scratch/reference.pro scratch/verses.local.json
# Si el banner tiene varios textos, seleccionar el nombre exacto del elemento:
node scratch/clone-slide.js scratch/reference.pro scratch/verses.local.json "Versículo"
```

La sustitución modifica el RTF del elemento seleccionado y el label de la
acción. También renueva identidades de presentación/cue/acción/slide/elementos y
actualiza referencias internas y miembros del grupo para evitar duplicados.
Conserva los demás elementos, atributos, fondo, posición, transiciones y recursos;
no cambia mayúsculas, fuentes ni colores. No altera el archivo de entrada.

Hallazgo: `protobufjs` 8 puede conservar campos desconocidos, pero el valor
predeterminado `Reader.discardUnknown` es `true`. El helper local crea lectores
con `discardUnknown = false`; clonar por JSON perdería esos campos. El check
inyecta un campo desconocido, verifica que persiste y compara el cue completo
después de deshacer únicamente las modificaciones intencionadas.

Límite deliberado: se admite RTF con un tramo de texto uniforme y `uc1`.
Se rechazan grupos o cambios de formato dentro del texto, otras codificaciones
Unicode RTF y selección ambigua entre varios elementos; no se inventa un estilo
de reemplazo. Recursos externos siguen apuntando a sus rutas originales y los
rangos de atributos personalizados se conservan, sin reajustarlos a textos más
largos. La fidelidad del banner, incluidos esos rangos, requiere la referencia
real y una comparación visual en ProPresenter.

Prueba local reproducible sin el banner:

```sh
node scratch/check-spike.js
node scratch/clone-slide.js scratch/out/synthetic-reference.pro
```

También se probó una copia de la primera slide de `Template.pro` del repo de
bevanjkay en `scratch/out/upstream-reference.pro`; el resultado decodifica con
dos labels y conserva su estructura. Esta copia no sustituye `reference.pro`.

## 3. Demo de arrastre

Comando exacto desde la raíz:

```sh
node scratch/gen-pro.js
./node_modules/.bin/electron scratch/drag-demo/main.js
```

Para arrastrar el clon del banner:

```sh
PRO_FILE="$PWD/scratch/out/cloned.pro" ./node_modules/.bin/electron scratch/drag-demo/main.js
```

Arrastrar la tarjeta a una playlist de prueba y luego a una librería de prueba.
Confirmar que se importa una presentación con dos slides, que el texto y los
labels son correctos y, para el clon, que el banner coincide con el original.
Registrar por separado ambos destinos: una llamada a `startDrag` no confirma
que ProPresenter haya aceptado el archivo.

```sh
./node_modules/.bin/electron scratch/drag-demo/main.js --smoke
```

Smoke ejecutado: **OK**, abre una ventana oculta, verifica tarjeta, preload e
icono y sale; no simula el gesto ni el drop. El evento real envía IPC y el
proceso principal ejecuta `event.sender.startDrag({ file, icon })` con una ruta
fija y un icono nativo obtenido antes de arrastrar. Renderer sin Node, sandbox y
aislamiento activados. Patrón basado en la
[documentación oficial de Electron](https://www.electronjs.org/docs/latest/tutorial/native-file-drag-drop).

## 4. API.Bible

Definir `API_BIBLE_KEY` mediante el entorno local sin guardarla en el repositorio:

```sh
node scratch/bibles.js
```

Consulta `GET https://api.scripture.api.bible/v1/bibles?language=spa` con header
`api-key`, timeout de 15 segundos y validación de HTTP/JSON. Si tiene éxito escribe
`scratch/out/bibles-spa.json` y actualiza automáticamente la tabla entre los
marcadores de abajo con todas las Biblias devueltas para esa cuenta. Los IDs no
se infieren ni se inventan. Sin clave, informa **PENDIENTE** y no hace la petición.

<!-- API_BIBLE_START -->
PENDIENTE: falta `API_BIBLE_KEY`; no hay disponibilidad ni IDs confirmados.
Objetivos de la consulta, no resultados observados:

| id | abreviatura buscada | nombre buscado |
| --- | --- | --- |
| PENDIENTE | RVR1960 / RVR60 | Reina-Valera 1960 |
| PENDIENTE | NVI | Nueva Versión Internacional |
| PENDIENTE | TLA | Traducción en Lenguaje Actual |
| PENDIENTE | PDT | Palabra de Dios para Todos |
| PENDIENTE | RV1909 y similares | Otras Biblias en español disponibles para la cuenta |
<!-- API_BIBLE_END -->

## Continuidad para el coordinador

Realizado: generador y decodificación, clonación conservadora, demo de arrastre,
cliente API.Bible y check reproducible de la lógica no trivial. Verificaciones
ejecutadas: generación/labels, preservación de campos y estilos en el fixture,
rechazo de formatos no soportados, HTTP simulado, recuperación de RTF con
`textutil`, clon de ejemplo upstream y smoke de Electron.

Pendiente externo: `reference.pro`, clave API y prueba manual en ProPresenter.
Próximo paso: aportar los dos insumos y ejecutar los comandos anteriores;
actualizar cada veredicto con evidencia de importación y comparación visual.
