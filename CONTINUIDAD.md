# Continuidad

Plan vigente: `~/.claude/plans/contexto-en-mi-iglesia-majestic-corbato.md` (fase 1.6, ejecutada). Fases 2 y 3 sin plan.

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

Hechos no obvios:
- ProPresenter lee un `.pro` del disco solo la PRIMERA vez que se abre esa presentación en la sesión (probado: cerrado → aparece; abierto sin haberla seleccionado → aparece; ya abierta antes → no se actualiza hasta reiniciar). No acepta archivos soltados en la rejilla de slides. Si guarda después su copia en memoria, puede pisar lo añadido.
- API.Bible con la clave del usuario solo concede en español NTV, RVR1909, PDT-ti, VBL, BES: es licencia, no capacidad.
- XML Beblia: TLA agrupa versículos (vacíos = parte del anterior) y trae vacíos de origen 1 Crónicas 6, 1 Crónicas 26 e Isaías 38. Los NT solos numeran libros 40-66.
- Los textos bíblicos nunca se commitean ni se empaquetan (`scratch/bibles/` y `*.bible.xml` ignorados).
- El smoke fallaba ~1 de 4 por comparar contra estado de React obsoleto en `LimitFields`; ahora lee los inputs.

Pendiente:
- Verificación visual final de "Añadir a presentación": reiniciar ProPresenter y abrir `SPIKE2 copia` (debe mostrar 10 slides). Dos intentos de cierre por AppleScript fallaron (timeout y "Cancelado por el usuario"); no se forzó el proceso.
- Borrar `SPIKE2 copia.pro` de `Preestablecido` tras esa verificación (con confirmación del usuario).
- Banner real de la iglesia como plantilla para validar el clonado con diseño real.
- Instalar el `.dmg` en una Mac limpia.
- Fase 2 (montaje online del servicio + sync entre Macs) y fase 3 (modo en vivo por API REST).

Próximo paso: el usuario instala el `.dmg`, importa sus XML en Ajustes → Biblias sin conexión y prueba "Añadir a presentación" antes de abrir ProPresenter.
