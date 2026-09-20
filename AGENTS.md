# pphelper — reglas para agentes

App de escritorio (Electron + TypeScript) que genera presentaciones `.pro` de versículos y las entrega a ProPresenter (arrastre a playlist o copia a la carpeta de biblioteca).

## Estructura

- `src/bible.ts`: parseo de referencias (`parseRef`, `formatRef`, `BOOKS`) y `fetchVerses` (API.Bible con caché por capítulo).
- `src/split.ts`: cortes de slides, funciones puras (`toSlides`, `mergeSlides`, `splitSlide`).
- `src/pro.ts`: lectura/escritura de `.pro` (protobuf). Genera desde cero o clona la única slide de una plantilla.
- `src/main.ts` + `src/preload.ts`: Electron e IPC con sandbox, contextIsolation y validación del emisor.
- `src/library.ts`: detección de bibliotecas, plantillas de una slide y observación de carpeta.
- `src/renderer/`: UI productiva React, `App.tsx` y `SlidePreview.tsx`; Vite genera `dist/renderer/`.
- `src/smoke.ts`: prueba de integración de la ventana productiva y sus IPC con datos temporales.
- `src/types.ts`: contratos compartidos. Cambiarlos implica revisar todos los módulos.
- `proto/`: definiciones de ProPresenter7-Proto (origen en `proto/README.md`). No editar.
- `scratch/`: código desechable de spikes. No es código de producción.

## Reglas

- Por decisión del usuario, el renderer usa React + Tailwind + componentes Untitled UI ya instalados; estado local, sin router ni gestor global.
- TypeScript estricto. Sin dependencias nuevas salvo necesidad demostrada. Sin abstracciones especulativas.
- Sin claves API en el repo. La clave vive en `~/Library/Application Support/pphelper/config.json`.
- Mensajes de error visibles al usuario en español.
- Verificación mínima antes de cerrar: `npm run build` (incluye typecheck de UI y Vite), `npm test`, `npx electron . --smoke`. Cambios en `.pro` exigen prueba real en ProPresenter (abrir presentación, ver slides y labels).
- Continuidad de trabajo en `CONTINUIDAD.md`.
