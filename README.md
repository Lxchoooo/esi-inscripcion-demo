# Panel ESI

- Alumnos: https://lxchoooo.github.io/esi-inscripcion-demo/
- Profes: https://lxchoooo.github.io/esi-inscripcion-demo/?admin=1&demo=1
- Demo explícita: https://lxchoooo.github.io/esi-inscripcion-demo/?demo=1

Sin `?api=` y sin `?demo=1`, la página muestra un aviso y no guarda datos.
En demo, todo queda en el navegador y no hay clave real.

## Estructura

- `index.html`: el sitio publicado.
- `src/Code.gs`: backend de Apps Script.
- `src/Panel.html`: el panel completo, se pega como archivo HTML en Apps Script.
- `src/appsscript.json`: manifiesto de Apps Script.
- `tests/`: tests de lógica y de interfaz.

## Desplegar Code.gs

1. Crear una planilla de Google Sheets.
2. Extensiones > Apps Script. Pegar `src/Code.gs`.
3. Agregar un archivo HTML llamado `Panel` con el contenido de `src/Panel.html`.
4. Ejecutar `setup()` y autorizar.
5. Implementar > Nueva implementación > Aplicación web.
   - Ejecutar como: yo.
   - Acceso: cualquiera.
6. Copiar la URL `/exec`.

`setup()` deja la hoja `Signups` con la columna `presente` y genera las dos
claves si no existen. La lista de alumnos no se crea sola: se carga con
"Importar lista" en el panel o se pega en la hoja `Students`.

La hoja `Students` se lee por encabezado: `email, apellido, nombre, curso`.
Si no hay encabezado `apellido`, se acepta el formato viejo `mail;nombre;curso`
y el nombre se muestra tal cual. La importación escribe siempre las cuatro
columnas y acepta `mail;apellido;nombre;curso`; con tres columnas, la segunda
es el nombre completo.

## Roles y claves

Hay dos claves, en Script Properties, nunca en el código ni en la planilla:

- `ADMIN_PIN`: clave de profes. Ve todo y puede escribir.
- `GUIDE_PIN`: clave de guías. Solo lee.

En el login hay un solo campo: la clave decide el rol.

| | Profe | Guía |
|---|---|---|
| Por charla y sin anotar | sí | sí |
| Ver mails | sí | no |
| Cerrar o abrir la inscripción | sí | no |
| Borrar inscripciones | sí | no |
| Importar la lista de mails | sí | no |
| Descargar CSV | sí | no |
| Marcar presente | sí | sí |
| Ver reportes | sí | sí |
| Mails en los reportes | sí | no |
| Imprimir reportes | sí | sí |

El filtro por rol lo hace el backend, no la interfaz.

La clave se usa una sola vez: al entrar, el backend devuelve un token de
sesión de 2 horas, que tampoco se guarda en el disco. Tras 5 intentos
fallidos hay un bloqueo de 60 segundos.

En la demo, la clave `guia` entra con el rol de guía y cualquier otra entra
como profe.

## Reportes

La pestaña Reportes calcula todo en memoria desde la caché de la planilla; no
escribe hojas nuevas.

- Por curso: elegís el curso y ves la lista A-Z con los totales (en la lista,
  completos, incompletos, sin anotar), los presentes por franja y las tres
  charlas de cada alumno. El botón "Presente" marca la asistencia.
- Por charla: elegís la charla y ves inscriptos, presentes, ausentes, cupo y
  el desglose por curso.
- Total: totales generales, presentes por franja y la tabla de todas las
  charlas con inscriptos y presentes.

Los guías ven los reportes sin mails; los profes ven el mail debajo del nombre.
En el celular las tablas se muestran como tarjetas.

"Imprimir" abre el diálogo del navegador y genera un A4 vertical con una
página por curso (o por charla, según la pestaña activa), tabla numerada A-Z,
columna "Firma o presente" y fecha de emisión. En Chrome de Android:
Imprimir > Guardar como PDF.

El encabezado usa `SCHOOL_NAME` y `EVENT_NAME`, al principio del script de
`src/Panel.html`: cambiar `SCHOOL_NAME` por el nombre real del colegio.

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
- Para los mails de la lista, la API pública devuelve nombre y curso, para
  que el alumno reconozca su cuenta.
- La lista de inscriptos y los mails solo salen con clave válida, y las
  guías los ven sin mail.
- No versionar listas, CSV ni exportaciones: ver `.gitignore`.

## Tests

```
node tests/esi-tests.js src
node tests/ui-smoke.js src
```

Sin dependencias. Los tests de lógica cubren el backend, los roles y la
paridad con el panel; el smoke de interfaz corre el panel con un DOM
simulado. En GitHub Actions los dos archivos corren en cada push a `main`.
