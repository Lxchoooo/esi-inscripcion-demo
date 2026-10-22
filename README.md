# Panel ESI · Instituto Secundario Salsipuedes (ISS)

- Alumnos: https://lxchoooo.github.io/esi-inscripcion-demo/
- Profes: https://lxchoooo.github.io/esi-inscripcion-demo/?admin=1&demo=1
- Demo explícita: https://lxchoooo.github.io/esi-inscripcion-demo/?demo=1

Sin `?api=` y sin `?demo=1`, la página muestra un aviso y no guarda datos.
En demo, todo queda en el navegador y no hay clave real.

## Estructura

- `index.html`: el sitio publicado.
- `assets/logo.png`: logo del encabezado. Si falta, el panel usa una copia embebida.
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

`setup()` deja la hoja `Signups` con la columna `presente`, crea la hoja
`Sessions` y genera las dos claves si no existen. La lista de alumnos no se
crea sola: se carga con "Importar lista" en el panel o se pega en la hoja
`Students`.

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

## Interfaz

- La marca ISS usa `assets/logo.png` y una paleta verde con contraste
  verificado en modo claro y oscuro. Si la imagen no carga, queda un escudo
  embebido como respaldo.
- La pantalla de acceso usa una escala de 4/8/12/16/24 px, targets de 44 px,
  inputs de 16 px y `100dvh` para que el teclado no tape el formulario.
- En escritorio (1024 px o más), el panel de profes usa todo el ancho, tablas
  densas con encabezado fijo y los filtros de curso, división, charla y
  búsqueda en una sola barra.
- Atajos del panel: `1` a `5` cambian de pestaña y `/` enfoca la búsqueda.
  `Esc` sale del campo. Las guías solo llegan a las tres primeras pestañas.
- En celular de 360 px, todo va en una columna, los botones y controles miden
  44 px o más y la barra de confirmación queda fija abajo.
- Bajo el login hay un aviso para celulares compartidos. "Salir" revoca la
  sesión en el backend, borra el token local y vuelve al ingreso con mail.

## Sesión del alumno

Al identificarse, el panel guarda en `localStorage` solo `esi_session`, un
token opaco que empieza con `s_`. No guarda mail, DNI, nombre ni curso.

El backend guarda en la hoja `Sessions` el hash SHA-256 del token, el mail, el
nombre, el curso, el ciclo, la fecha de emisión, el vencimiento y si fue
revocado. El token crudo no se guarda. Esa hoja tiene datos personales: no se
comparte ni se descarga.

La sesión vence a los 7 días o 24 horas después del día del evento, lo que
ocurra antes. Si el token no existe, venció o fue revocado, el panel vuelve al
acceso con un mensaje corto. Al abrir la página con una sesión válida, entra
directo a las charlas.

"Salir" revoca el token en el backend y borra la copia local. "Cambiar datos"
hace lo mismo. En un celular compartido, tocar "Salir" al terminar.

En modo demo las sesiones viven en memoria: al recargar hay que volver a
entrar. No usar la lista real en demo.

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
columna "Firma o presente" y fecha y hora de emisión. En Chrome de Android:
Imprimir > Guardar como PDF.

El encabezado usa `SCHOOL_NAME` y `EVENT_NAME`, al principio del script de
`src/Panel.html`, ya configurados como "Instituto Secundario Salsipuedes (ISS)"
y "Jornada ESI 2026". La impresión fuerza blanco y negro, sin la navegación ni
los botones del panel.

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

- Confirmar en el encabezado impreso el nombre del instituto y la jornada.
- Probar el circuito con 10 o 20 alumnos de prueba: entrar con mail, entrar
  con DNI y apellido, anotarse en las tres franjas, marcar presente, imprimir
  un curso, mirar el panel a 360 px y probar "Salir" en un equipo compartido.
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

- El dispositivo guarda solo el token de sesión. La identidad queda en la
  hoja `Sessions` del backend y se usa para reanudar la sesión. El token vence
  solo y "Salir" lo revoca. En un celular compartido, usar "Salir" al
  terminar.
- En producción, el DNI no se guarda en el dispositivo, ni en reportes, ni en
  el CSV. Solo se usa en el servidor para validar DNI + apellido. En demo, la
  lista importada puede incluir DNI en `localStorage`.
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

Sin dependencias. Los tests de lógica cubren el backend, los roles, la
identidad ISS, el contraste de la paleta, el layout de escritorio y celular,
la sesión opaca (válida, vencida, revocada y sin acceso a otros datos), la
limpieza de sesión y la impresión; el smoke de interfaz corre el panel con
un DOM simulado. En GitHub Actions los dos archivos corren en cada push a
`main`.
