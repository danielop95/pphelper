# Renderer siguiente

Demo aislada; Electron productivo todavía carga `src/renderer/`.

- `npm run build:ui`: TypeScript estricto + Vite → `dist/renderer-next`.
- `npx electron scratch/spike2/ui-next-main.js --smoke`: demo bajo sandbox/CSP y captura `scratch/out/ui-next.png`.

Los componentes de `components/`, sus helpers y estilos proceden del repositorio
MIT [Untitled UI React](https://github.com/untitleduico/react/tree/c981a73bcd6b6c68d2a54070f20f020191212828),
commit `c981a73bcd6b6c68d2a54070f20f020191212828`, copiados manualmente sin modificar
su implementación. Licencia en `LICENSE-UNTITLED.md`. Button, Input, Select,
Checkbox, Tooltip, Badge, Modal y Tabs son del repositorio abierto; no hay PRO.

La CSP permite CSS local y únicamente el hash de la regla touch-action que
inyecta React Aria. El smoke recalcula ese hash sobre el estilo realmente
inyectado y falla ante cualquier error CSP. No se permiten scripts inline,
unsafe-eval ni conexiones de red. Tras actualizar el lock, ejecutar el smoke.

## Entrega A3 · 2026-09-20

Rama `main`, checkout `/Users/dan/Documents/Nkrease/pphelper`, worker A3.
Andamiaje confirmado en `0e9dd4e`; preview y demo en el commit `feat: SlidePreview`.

Verificado: `npm run build:ui`; `npx electron scratch/spike2/ui-next-main.js --smoke`;
`npm run build && npm test && npx electron . --smoke` (24 pruebas en esa ejecución).
Se revisó visualmente `scratch/out/ui-next.png`; resultados del smoke en
`scratch/out/ui-next-smoke.json`. Ambos artefactos se regeneran y están ignorados.
El smoke abre brevemente la ventana para verificar el tooltip con Tab real.

React/DOM 19.3.0, Tailwind 4.3.3, Vite 8.3.0, plugin-react 6.1.1,
React Aria Components 1.21.1 / React Aria 3.52.1, fijados por el lock raíz.
Cero errores CSP; hash revalidado:
`sha256-38RhXrc7EdReTKsOm23ZPOCUgniTUUcjky8QOOrQx6o=`.
Vite conserva su aviso informativo de chunk mayor de 500 kB (JS ≈540 kB / 163 kB gzip).

`SlidePreview` usa las unidades del modelo y container queries, preserva capas,
opacidad, rellenos e imágenes data URI; el texto usa pre-wrap y overflow visible.
Marca `data-overflow="true"` en la caja de texto y `data-unsupported="true"` en
los elementos aproximados. El smoke verifica desbordamiento, su eliminación al
ampliar la caja, escalado, imagen, borde y controles. Interlineado 1.2 e imágenes
con object-fit cover son aproximaciones; no se atribuye fidelidad exacta a ProPresenter.

Pendiente: integración por el coordinador con el IPC y empaquetado productivos;
no hay bloqueos de A3. El renderer actual y sus scripts build/test siguen intactos.
El coordinador consolida este relevo en `CONTINUIDAD.md` compartido.
