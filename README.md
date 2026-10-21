# Panel ESI

- Alumnos: https://lxchoooo.github.io/esi-inscripcion-demo/
- Profes: https://lxchoooo.github.io/esi-inscripcion-demo/?admin=1&demo=1
- Demo explícita: https://lxchoooo.github.io/esi-inscripcion-demo/?demo=1

Sin `?api=` y sin `?demo=1`, la página muestra un aviso y no guarda datos.
En demo, todo queda en el navegador y no hay clave real.

## Desplegar Code.gs

1. Crear una planilla de Google Sheets.
2. Extensiones > Apps Script. Pegar `Code.gs`.
3. Agregar un archivo HTML llamado `Panel` con el contenido de `Panel.html`.
4. Ejecutar `setup()` y autorizar.
5. Implementar > Nueva implementación > Aplicación web.
   - Ejecutar como: yo.
   - Acceso: cualquiera.
6. Copiar la URL `/exec`.

## Configurar la clave

- La clave vive en Script Properties con el nombre `ADMIN_PIN`.
- `setup()` la genera si no existe. Para cambiarla, editá `ADMIN_PIN` en
  Project Settings > Script Properties.
- No está en el código ni en la planilla. Se valida solo en el backend.
- Tras 5 intentos fallidos hay un bloqueo de 60 segundos.
- El navegador no guarda la clave: al recargar el panel se vuelve a pedir.

## Conectar esta web

Abrir una vez:

```
https://<usuario>.github.io/<repo>/index.html?api=<URL-del-Apps-Script>
```

Queda guardada en ese navegador. Para cambiar de backend, abrir con el nuevo
`?api=`. Para desconectar, borrar los datos del sitio.

Panel de profes: la misma URL con `?admin=1`. No hay links de acceso en la
vista de alumnos.

## Privacidad

- En modo real no se guardan mails, nombres ni listas en `localStorage`.
- El alumno se mantiene en `sessionStorage` y se borra al cerrar la pestaña.
- La API pública devuelve charlas, horarios, cupos y las elecciones propias.
- La lista de inscriptos y los mails solo salen con clave válida.
- No versionar listas, CSV ni exportaciones: ver `.gitignore`.
