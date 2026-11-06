# Pasar archivos (`file-drop`)

Servidor local para transferir archivos desde el navegador del teléfono a este
entorno. No usa dependencias y escucha **solo** en `127.0.0.1`.

```sh
node scripts/file-drop.js
```

Después abrir:

```
http://127.0.0.1:8787
```

## Qué hace

- Acepta cualquier tipo de archivo y subidas grandes por streaming.
- Permite arrastrar, pegar desde el portapapeles o elegir varios archivos.
- Muestra progreso, lista los archivos guardados y permite descargarlos o
  borrarlos.
- Guarda todo en `.file-drop/uploads/`, una carpeta ignorada por git.
- El máximo por archivo es de 4 GB; se puede cambiar con `MAX_UPLOAD_BYTES`.
- El puerto se puede cambiar con `PORT`.

## Notas

- No se sube nada a internet: los archivos quedan en el teléfono.
- Si se cierra la página en medio de una subida, el servidor borra el archivo
  temporal incompleto.
- Los archivos subidos no se versionan. No commitear audios, fotos ni datos
  personales que lleguen por acá.
