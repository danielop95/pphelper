# pphelper

App para macOS que convierte referencias bíblicas en presentaciones `.pro`
para ProPresenter. Permite ajustar los cortes de los versículos y usar tu plantilla.

## Instalación

1. Abre el `.dmg` y arrastra pphelper a Aplicaciones.
2. La app no está firmada: la primera vez, haz clic derecho sobre pphelper
   en Aplicaciones → **Abrir** y confirma la apertura.

## Primer uso

1. Abre **Ajustes → Biblias sin conexión → Importar XML…** para importar una Biblia local.
   No necesitas cuenta, clave de API.Bible ni conexión para consultarla.
2. Si prefieres API.Bible, obtén una clave en <https://scripture.api.bible>,
   pégala en Ajustes y pulsa **Cargar Biblias**.
3. Marca las versiones de API.Bible que quieras usar; las locales se añaden automáticamente.
4. En **Biblioteca de plantillas**, elige una biblioteca de ProPresenter o **Elegir carpeta…**.
   Guarda allí presentaciones `.pro` de una sola diapositiva: aparecerán como tarjetas
   y se actualizarán al crear, modificar o borrar archivos en esa carpeta.
   Si tienen varios textos, el mayor recibe el versículo y el menor la referencia y versión.
   Las plantillas importadas con versiones anteriores siguen en su carpeta original:
   Ajustes muestra un aviso para elegir esa carpeta; no se borran ni se copian archivos.
5. Revisa la carpeta de biblioteca si vas a usar **Enviar a biblioteca**.

## Uso diario

1. Elige versión y plantilla, escribe una referencia como `Salmos 23:1-4` y pulsa **Enter**.
2. Revisa las vistas previas y edita el texto. Para **Partir aquí**, coloca el cursor
   dentro del texto; **Unir con siguiente** combina dos diapositivas.
3. Ajusta **Mín. / Máx.** en la tarjeta seleccionada. Los límites se guardan por nombre
   de plantilla al salir del campo o pulsar Enter y reorganizan el pasaje original.
   **Sin plantilla** tiene límites propios y genera texto blanco sobre fondo negro.
4. **Reorganizar** recalcula los cortes desde los versículos originales y reemplaza
   las ediciones manuales. Cambiar de plantilla lo hace automáticamente solo cuando
   no has editado; si hay ediciones, se conservan y el botón queda resaltado.
5. Arrastra la presentación a una playlist de ProPresenter o pulsa **Enviar a biblioteca**.
   Si ya existe un archivo con ese nombre en la biblioteca, se sobrescribe.

Los capítulos consultados en API.Bible quedan guardados para poder reutilizarlos sin conexión.

La última plantilla queda seleccionada al volver a abrir la app. El aviso **No cabe**
indica texto que desborda su caja; ajusta los cortes o los límites. Las vistas previas
son aproximadas: comprueba efectos y diseño final en ProPresenter.

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
