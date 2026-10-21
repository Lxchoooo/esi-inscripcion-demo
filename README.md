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

La hoja `Students` se lee por encabezado: `email, apellido, nombre, curso, dni`.
El DNI es opcional. Si no hay encabezado `apellido`, se acepta el formato viejo
`mail;nombre;curso` y el nombre se muestra tal cual. La importación escribe
siempre las cinco columnas y acepta:

- `mail;apellido;nombre;curso;dni`
- `mail;apellido;nombre;curso`
- `mail;nombre completo;curso`

El DNI se guarda solo con dígitos (7 u 8): si viene con puntos o espacios, se
normaliza. Un DNI inválido se descarta y, si se repite, el segundo alumno queda
sin acceso por DNI; la importación informa cuántos quedaron así.

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

## Día del evento

Antes de abrir:

- Cambiar `SCHOOL_NAME` por el nombre real del colegio.
- Probar el circuito con 10 o 20 alumnos de prueba: entrar con mail, entrar
  con DNI y apellido, anotarse en las tres franjas, marcar presente, imprimir
  un curso y mirar el panel a 360 px.
- Descargar una copia de la planilla (Archivo > Hacer una copia) y un CSV
  desde Inscriptos. Si algo sale mal, la copia es el respaldo.
- Revisar que la lista tenga apellido y curso. Sin apellido no funciona el
  login por DNI; sin curso, el alumno lo elige al entrar.
- Confirmar que `ADMIN_PIN` y `GUIDE_PIN` sean las claves del día y que solo
  las tengan profes y guías. Se cambian en Script Properties; el próximo
  ingreso usa la nueva y no hace falta redesplegar.
- Al terminar el evento, rotar las claves o borrarlas.

Durante el evento:

- Si aparece "El servidor está ocupado. Probá de nuevo.", la operación no se
  guardó. Esperar un segundo y reintentar; el panel reintenta solo hasta tres
  veces. No hace falta volver a anotarse: un envío repetido no duplica filas.
- Si una guía no ve los datos, pedirle que vuelva a entrar: el token dura dos
  horas.
- Las inscripciones se pueden cerrar desde el panel de profes; los reportes y
  la asistencia siguen funcionando.
- Para imprimir, usar Chrome > Imprimir > Guardar como PDF. Verificar el A4 y
  la fecha antes de repartir.

Después:

- Descargar el CSV final y guardar una copia de la planilla.
- Rotar las claves si se compartieron por mensaje.

## Privacidad

- La identidad del alumno (mail, nombre, curso y ciclo) queda en
  `localStorage` del dispositivo hasta que toque "Salir" o borre los datos del
  sitio. No vence sola. En un celular compartido, usar "Salir" al terminar.
- El DNI nunca se guarda en el dispositivo, ni en reportes, ni en el CSV.
  Solo se usa en el servidor para validar DNI + apellido.
- La API pública devuelve charlas, horarios, cupos y las elecciones propias.
  Para cualquier mail cargado en la lista, devuelve nombre y curso, para que
  el alumno reconozca su cuenta. Cualquiera que sepa o adivine un mail
  institucional puede ver ese nombre y curso.
- El login por DNI devuelve el mail solo cuando el DNI y el apellido coinciden
  con un único alumno. Después de cinco fallos por DNI hay un bloqueo de un
  minuto. El DNI no es un dato secreto: el apellido es una barrera débil.
- La lista de inscriptos y los mails solo salen con clave válida, y las guías
  los ven sin mail.
- En modo demo, la lista importada (incluido el DNI) se guarda en
  `localStorage` del navegador. Usar datos de prueba, no la lista real.
- No versionar listas, CSV ni exportaciones: ver `.gitignore`.

## Tests

```
node tests/esi-tests.js src
node tests/ui-smoke.js src
```

Sin dependencias. Los tests de lógica cubren el backend, los roles y la
paridad con el panel; el smoke de interfaz corre el panel con un DOM
simulado. En GitHub Actions los dos archivos corren en cada push a `main`.
