# Renderer productivo

React + TypeScript estricto + Tailwind + Untitled UI; estado local en `App.tsx`.
Electron carga `dist/renderer/index.html`, generado por `npm run build`.
`npm run build:ui` verifica los tipos del renderer y ejecuta Vite.

`App.tsx` contiene búsqueda, selección de plantilla, edición, entrega y Ajustes.
`SlidePreview.tsx` dibuja el `SlideModel` obtenido por IPC; los datos y archivos
permanecen en el proceso principal. La edición invalida el archivo arrastrable
hasta que termina una nueva generación. Los previews de texto usan debounce de 150 ms.

Los componentes de `components/`, sus helpers y estilos proceden del repositorio
MIT [Untitled UI React](https://github.com/untitleduico/react/tree/c981a73bcd6b6c68d2a54070f20f020191212828),
commit `c981a73bcd6b6c68d2a54070f20f020191212828`.
Licencia en [LICENSE-UNTITLED.md](LICENSE-UNTITLED.md); no hay componentes PRO.

La CSP permite CSS local y únicamente el hash de la regla touch-action que
inyecta React Aria. El smoke recalcula el hash del estilo inyectado y falla
ante errores de consola/CSP. No se permiten scripts inline, unsafe-eval ni
conexiones de red desde el renderer. Tras actualizar dependencias, ejecutar el smoke.

`SlidePreview` preserva geometría, capas, opacidad, rellenos e imágenes data URI.
Marca `data-overflow="true"` cuando un texto excede su caja y
`data-unsupported="true"` en elementos aproximados. Interlineado 1.2 e imágenes
con object-fit cover son aproximaciones: revisar el resultado en ProPresenter.

`npx electron . --smoke` ejecuta la app productiva con datos temporales y genera
`scratch/out/app-next.png` y `scratch/out/app-next.pro`. Comprueba caché, Enter,
overflow, edición/unión/división, Reorganizar, límites, plantillas sincronizadas,
clonado, entrega con sobrescritura, ventana mínima, sandbox y CSP.
