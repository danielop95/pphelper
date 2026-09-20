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
