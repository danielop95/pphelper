# pphelper

App para macOS que convierte referencias bíblicas en presentaciones `.pro`
para ProPresenter. Permite ajustar los cortes de los versículos y usar tu plantilla.

## Instalación

1. Abre el `.dmg` y arrastra pphelper a **Aplicaciones**.
2. La app no está firmada y macOS la bloquea la primera vez. Sin Terminal: intenta
   abrirla una vez y ve a **Ajustes del Sistema → Privacidad y seguridad → Abrir
   igualmente** (en macOS anteriores a Sequoia basta clic derecho → **Abrir**).
   Alternativa con Terminal:

   ```bash
   xattr -dr com.apple.quarantine /Applications/pphelper.app
   ```

3. Solo se hace una vez. Desde la 0.2.5, cuando hay una versión nueva la app muestra
   **Actualizar ahora**: la descarga, comprueba su SHA-256 con el publicado en GitHub,
   la instala y se reabre, sin pasos extra de seguridad.

## Primer uso

1. Abre **Ajustes → Biblias en esta Mac → Agregar Biblia (XML)…** para importar una Biblia local.
   No necesitas cuenta, clave de API.Bible ni conexión para consultarla.
2. Si prefieres API.Bible, obtén una clave en <https://scripture.api.bible>,
   pégala en Ajustes y pulsa **Ver Biblias disponibles**.
3. Marca las versiones de API.Bible que quieras usar; las locales se añaden automáticamente.
4. En **Plantilla**, pulsa **Crear desde imagen…** y elige el PNG de tu banner (1920×1080).
   La app coloca el versículo y la cita en la franja opaca; mueve las cajas arrastrando
   y elige tipografía, tamaño, color y alineación. También puedes **Importar de
   ProPresenter…** una presentación `.pro` o `.proBundle` de una sola diapositiva.
   Las plantillas se guardan dentro de la app; si cambias el diseño, vuelve a crearla
   o importarla con el mismo nombre.

## Uso diario

1. Elige Biblia y plantilla, escribe un pasaje como `Salmos 23:1-4` y pulsa **Buscar pasaje**.
2. Revisa las vistas previas y edita el texto. Para **Dividir en el cursor**, haz clic
   dentro del texto donde quieras cortar; **Unir con la siguiente** combina dos diapositivas.
3. Ajusta **Letras por diapositiva** (mínimo y máximo) en la tarjeta seleccionada: menos
   letras, más diapositivas. Se guardan por plantilla. **Fondo negro simple** genera
   texto blanco sobre negro.
4. **Repartir de nuevo** recalcula los cortes desde los versículos originales y reemplaza
   los cambios hechos a mano.
5. Arrastra la tarjeta de abajo a una playlist de ProPresenter.

Con ProPresenter 21 o anterior puedes activar en Ajustes **Uso ProPresenter 21 o anterior**
para ver **Enviar a biblioteca** y **Agregar a una presentación…** (ProPresenter 22 ya no
lee esos archivos).

Los capítulos consultados en API.Bible quedan guardados para poder reutilizarlos sin conexión.

La última plantilla queda seleccionada al volver a abrir la app. El aviso **Texto muy largo**
indica texto que desborda su caja; ajusta los cortes o las letras por diapositiva. Las
vistas previas son aproximadas: comprueba el diseño final en ProPresenter.

## Biblias sin conexión

El importador admite XML con el formato por líneas de
[Beblia/Holy-Bible-XML-Format](https://github.com/Beblia/Holy-Bible-XML-Format).
Puedes obtener un archivo de ese repositorio o de tu proveedor autorizado y guardarlo
como `.xml` antes de importarlo. La disponibilidad de un archivo no concede permiso
para usar o redistribuir su traducción: comprueba sus condiciones y usa solo textos
que tengas derecho a utilizar. pphelper no incluye ni descarga traducciones.

Puedes importar varios archivos a la vez. Ajustes muestra el nombre, el número de
versículos, los avisos y el campo `status` del XML. La abreviatura se guarda al salir
del campo o pulsar Enter; **Quitar** pide confirmación. Los textos se guardan solo en
este equipo, en `~/Library/Application Support/pphelper/bibles.db`.

El XML debe contener al menos 27 libros y 7000 versículos con texto. Los versículos
vacíos que siguen a uno con texto se representan como un grupo (por ejemplo,
`Génesis 2:1-3`); consultar cualquiera de sus números devuelve el grupo completo.
Los capítulos ausentes se señalan con un mensaje, sin inventar texto. Reimportar
el mismo nombre de archivo reemplaza esa Biblia; un XML inválido conserva la copia anterior.

## Añadir a una presentación

1. Busca el pasaje y revisa las diapositivas.
2. Pulsa **Añadir a presentación…** y elige un `.pro` de tus bibliotecas.
   La biblioteca de plantillas se excluye y la última presentación queda recordada.
3. Confirma para añadir las diapositivas al final, en un grupo nuevo, conservando las anteriores.

**ProPresenter solo lee el archivo la primera vez que abres esa presentación.**
Si ya la abriste desde que iniciaste ProPresenter, reinícialo para ver los cambios.
Si guardas esa presentación desde ProPresenter después, podrías perder lo añadido.
El modal resalta cuando ProPresenter está abierto. Lo más sencillo es añadir con
ProPresenter cerrado o antes de abrir la presentación en esa sesión.

Antes de escribir se guarda una copia completa en
`~/Library/Application Support/pphelper/backups/<nombre>-<fecha-hora>.pro`.
La escritura es atómica y se cancela si el archivo cambia durante la operación;
no sincroniza cambios posteriores de ProPresenter. Para restaurar una copia,
cierra ProPresenter y reemplaza el archivo de destino por el respaldo elegido.

## Desarrollo

- `npm run build`: compila Electron, verifica los tipos de React y genera la UI con Vite.
- `npm test`: pruebas de Biblia, cortes, protobuf y bibliotecas.
- `npx electron . --smoke`: integración real con datos temporales, XML sintético sin red, append con respaldo y capturas en `scratch/out/app-next.png`, `f16-settings.png` y `f16-append.png`.
- `npm run dist`: genera el instalador `.dmg` en `out/`.
