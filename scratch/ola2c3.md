# Relevo OLA 2-C + 3 — 2026-09-20

Rama `main`, checkout `/Users/dan/Documents/Nkrease/pphelper`.
Nota del worker para que el coordinador consolide `CONTINUIDAD.md`.

Realizado: ventana única de 420×700 siempre encima, preload aislado con sandbox,
IPC validado, consulta con caché, edición/unión/división de slides, generación
con debounce de 300 ms, arrastre nativo de un archivo ya generado, envío a
biblioteca, ajustes y plantillas de una diapositiva. Configuración, caché,
plantillas y salida viven bajo `app.getPath('userData')`.
Los módulos `types.ts`, `bible.ts`, `split.ts` y `pro.ts` no se modificaron.
No se añadieron dependencias ni se cambió el lockfile.

Empaquetado: appId `com.nkrease.pphelper`, DMG arm64, sin firma ni notarización,
con `proto/` como recurso externo y `setProtoDir` al arrancar empaquetado.
`npm run dist` compila primero y fija `CSC_IDENTITY_AUTO_DISCOVERY=false`.
El renderer HTML/CSS/JS y las dependencias de producción están incluidos.

Verificaciones ejecutadas:

- `npm run build`: correcto, TypeScript estricto, incluido preload.
- `npm test`: 11 tests correctos, 0 fallos.
- `npm start -- --smoke`: correcto; abre una ventana real y usa un directorio
  temporal separado de los datos del usuario. Verifica sandbox, preload, IPC,
  caché sin clave/red, edición con bloqueo de arrastre durante el debounce,
  unión/división, copia a biblioteca, rechazo de sobrescritura, referencia
  inválida y lectura del `.pro` resultante con dos slides.
- `npm start -- --remote-debugging-port=9338`: ventana abierta para revisión
  visual; estados de ajustes y slides inspeccionados, sin overflow horizontal
  a 420 px. La ventana de revisión se cerró al terminar.
- `npm run dist`: correcto con electron-builder 26.15.3 / Electron 44.4.3.
- `out/mac-arm64/pphelper.app/Contents/MacOS/pphelper --smoke`: correcto;
  confirma también renderer/preload dentro de ASAR y protos en Resources.
- `hdiutil verify out/pphelper-0.1.0-arm64.dmg`: checksum válido.
- `git diff --check`: correcto.

Artefacto: [out/pphelper-0.1.0-arm64.dmg](../out/pphelper-0.1.0-arm64.dmg),
128.436.819 bytes (aprox. 122,49 MiB). Se conserva fuera de Git conforme a
`.gitignore`.

Commit de aplicación: `d195698` (`feat: app Electron con arrastre a ProPresenter`).
Este relevo acompaña el commit `build: empaquetado dmg`.

Bloqueos: ninguno. Pendiente de comprobación manual: soltar el arrastre en
ProPresenter y consultar API.Bible con una clave real; no se proporcionó una
clave para esta tarea. Los mensajes de error impresos por Electron durante
`--smoke` corresponden a rechazos intencionados que la prueba verifica.
Electron-builder informa del icono estándar y de la ausencia de author y
description; no impidieron generar ni abrir la aplicación.

El cambio previo en `scratch/SPIKE.md` pertenece a otro agente y se preservó.
Próximo paso: el coordinador puede probar la importación real y consolidar la
continuidad compartida.

Referencias técnicas consultadas:
[Sandbox de Electron](https://www.electronjs.org/docs/latest/tutorial/sandbox)
y [firma macOS de electron-builder](https://www.electron.build/v26/docs/features/code-signing/code-signing-mac/).
Los canales de `types.ts` se pasan al preload en `additionalArguments` porque
un preload sandboxed no puede cargar módulos locales CommonJS.
