# Continuidad

Plan aprobado: `~/.claude/plans/contexto-en-mi-iglesia-majestic-corbato.md` (fase 1: versículos; fases 2 y 3 pendientes).

## 2026-09-20

Realizado:
- Esqueleto, spike (`scratch/SPIKE.md`), módulos `bible`, `split`, `pro`, app Electron y `.dmg` (`out/pphelper-0.1.0-arm64.dmg`).
- Verificado en ProPresenter 21.4 (esta Mac): `.pro` generado desde cero abre con slides, texto y labels correctos; "Enviar a biblioteca" funciona; unión de slides correcta.
- API.Bible con clave del usuario: disponibles en español NTV, RVR1909, PDT-ti, VBL, BES. No aparecen RVR1960/NVI/TLA (revisar panel de API.Bible para añadir licenciadas).
- Correcciones de auditoría aplicadas y verificadas visualmente (grupo por capítulo, nombre de archivo sin `:`, sobrescritura en biblioteca, referencia en plantilla de 2 textos, README). `.dmg` regenerado con las correcciones.

Pendiente:
- Prueba manual de arrastre de la tarjeta a una playlist de ProPresenter (usuario).
- `scratch/reference.pro` con el banner real de la iglesia para validar clonado de diseño (usuario debe exportar 1 slide).
- Instalar `.dmg` en Mac limpia y probar.
- Fase 2 (montaje online del servicio + sync) y fase 3 (modo en vivo vía API REST): planes aparte.

Verificaciones ejecutadas: `npm run build`, `npm test` (12 tests), `npx electron . --smoke`, prueba visual en ProPresenter.

Próximo paso: usuario prueba arrastre a playlist y aporta `reference.pro`; validar clonado de banner real (2 textos) en ProPresenter.
