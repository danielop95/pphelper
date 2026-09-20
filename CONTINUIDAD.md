# Continuidad

Plan vigente: `~/.claude/plans/contexto-en-mi-iglesia-majestic-corbato.md` (fase 1.5). Fases 2 y 3 pendientes de plan.

## 2026-09-20

Realizado (todo en `main`, último commit `fce9529`):
- Fase 1: app Electron que genera `.pro` de versículos (API.Bible con caché), arrastre a playlist (probado por el usuario) y "Enviar a biblioteca".
- Fase 1.5: renderer React + Tailwind + Untitled UI; cortes automáticos equilibrados (`toSlides` con mín/máx, por plantilla); botón Reorganizar; plantillas sincronizadas desde una biblioteca de ProPresenter con selector gráfico y vista previa por slide (`readSlideModel`); referencia en el segundo texto de plantillas con 2 textos; clonado de plantillas con texto vacío desde `text.attributes` (caso `MEnsaje`); caché de la lista de plantillas.
- Instalador: `out/pphelper-0.1.0-arm64.dmg` (~134 MB, sin firma: clic derecho → Abrir).

Verificado esta sesión: `npm run build`, `npm test` (25), `npx electron . --smoke`; app real con `1 Reyes 17:1-8` (7 slides con vista previa) y `Salmos 23` con plantilla `MEnsaje` (5 slides, grupo `Salmos 23`, RTF centrado 42 pt); en ProPresenter 21.4, presentación `app-next` con plantilla de 2 textos muestra versículo + referencia sobre fondo azul. `MEnsaje.pro` intacto (sha256 `10459dc7…`).

Hechos que no son obvios:
- Escribir cues en un `.pro` que ProPresenter tiene abierto NO se refleja (spike2: archivo correcto, app sigue mostrando 1 slide). Por eso "insertar en presentación existente" no está implementado.
- API.Bible con la clave del usuario: NTV, RVR1909, PDT-ti, VBL, BES. RVR1960/NVI/TLA no aparecen.
- Automatizar `Cmd+C` de una slide en ProPresenter no llenó el portapapeles; el formato interno de copia sigue sin inspeccionar.

Pendiente:
- Insertar en presentación existente: depende de dos pruebas manuales del usuario (soltar la tarjeta sobre la rejilla de slides de una presentación abierta; `Cmd+C` de una slide y volcar tipos del portapapeles).
- Decidir vista previa compacta (miniaturas junto al texto): cada preview ocupa media pantalla en 480 px.
- Banner real de la iglesia como plantilla en una biblioteca de plantillas, para validar clonado con diseño real.
- Instalar el `.dmg` en una Mac limpia.
- Archivos de prueba en la biblioteca real de ProPresenter (`Preestablecido`): `app-next.pro`, `Prueba OLA B.pro`, `SPIKE2 copia.pro`. Borrarlos solo con confirmación del usuario.
- Fase 2 (montaje online del servicio + sync) y fase 3 (modo en vivo por API REST): planes aparte.

Próximo paso: recoger respuestas del usuario (vista compacta, pruebas de inserción, banner real) y planificar según ellas.
