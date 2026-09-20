# pphelper

App para macOS que convierte referencias bíblicas en presentaciones `.pro`
para ProPresenter. Permite ajustar los cortes de los versículos y usar tu plantilla.

## Instalación

1. Abre el `.dmg` y arrastra pphelper a Aplicaciones.
2. La app no está firmada: la primera vez, haz clic derecho sobre pphelper
   en Aplicaciones → **Abrir** y confirma la apertura.

## Primer uso

1. Obtén una clave de API.Bible en <https://scripture.api.bible>.
2. Abre **Ajustes**, pega la clave y pulsa **Cargar Biblias**.
3. Marca las versiones que quieras usar.
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

Los capítulos consultados quedan guardados para poder reutilizarlos sin conexión.

La última plantilla queda seleccionada al volver a abrir la app. El aviso **No cabe**
indica texto que desborda su caja; ajusta los cortes o los límites. Las vistas previas
son aproximadas: comprueba efectos y diseño final en ProPresenter.

## Desarrollo

- `npm run build`: compila Electron, verifica los tipos de React y genera la UI con Vite.
- `npm test`: pruebas de Biblia, cortes, protobuf y bibliotecas.
- `npx electron . --smoke`: integración real con datos temporales y captura en `scratch/out/app-next.png`.
- `npm run dist`: genera el instalador `.dmg` en `out/`.
