# Jornada ESI - Inscripcion a charlas

App para que los alumnos del Instituto Secundario Salsipuedes elijan una
charla por franja horaria. Incluye panel de profes, asistencia, reportes,
impresion, calendario, recordatorios por mail, correcciones manuales y
herramientas de cierre y privacidad.

- Sitio: https://lxchoooo.github.io/esi-inscripcion-demo/
- Demo: https://lxchoooo.github.io/esi-inscripcion-demo/?demo=1
- Panel demo: https://lxchoooo.github.io/esi-inscripcion-demo/?admin=1&demo=1

El panel real de profes y guias se abre desde la URL `/exec` del Apps Script,
no desde GitHub Pages. La documentacion tecnica completa esta en
[AGENTS.md](AGENTS.md).

## Que incluye

- Acceso con mail institucional sin necesidad de padron.
- Acceso por DNI + apellido si se carga la hoja `Students`.
- Validacion de nombre y apellido: letras, espacios, apóstrofe y guion.
- Eleccion de tres charlas, una por horario, con control de cupo.
- Sesion opaca: el navegador guarda solo un token, no la identidad.
- Ticket de login de un solo uso para quien ya tiene inscripciones.
- Panel de profes con cupos, inscriptos, incompletos, reportes y graficos.
- Asistencia movil con filtros, deshacer y cola offline.
- Impresion A4 y exportacion CSV.
- Archivo `.ics` con las tres charlas y recordatorio 10 minutos antes.
- Recordatorios por mail solo para quienes marcaron la casilla opt-in.
- Remitente configurable y control de cuota por tandas.
- Configuracion de fecha, zona horaria, remitente, modo ensayo y respaldo.
- Pestana Estado con servidor, ultima inscripcion, sesiones y cuota.
- Pestana Correcciones para agregar, corregir, mover, fusionar o borrar alumnos.
- Copia de solo lectura por charla para seguir marcando presentes sin conexion.
- Cierre del evento y borrado de datos personales con confirmacion.

## Inicio rapido

El sitio publicado no necesita instalacion. Para probar sin datos reales:

```text
https://lxchoooo.github.io/esi-inscripcion-demo/?demo=1
```

Para usar el backend real:

1. Crear una planilla de Google Sheets.
2. Extensiones > Apps Script.
3. Pegar `src/Code.gs`.
4. Crear un archivo HTML llamado `Panel` y pegar `src/Panel.html`.
5. Ejecutar `setup()` y autorizar.
6. Implementar como aplicacion web, ejecutar como el dueno y acceso para
   cualquiera.
7. Abrir el sitio una vez con `?api=<URL-/exec>`.
8. Compartir a profes y guias la URL `<URL-/exec>?admin=1`.

Si la planilla ya existia, volver a ejecutar `setup()` para crear `Log`,
`Backup`, las columnas `presente`, `apellido`, `recordatorio` y `prueba`, y
las claves de configuracion nuevas. `setup()` tambien instala el respaldo
automatico cada 30 minutos si `backup_activo` esta en `si`.

## Acceso

El camino principal es el mail `@secundariosalsipuedes.edu.ar`. El alumno
escribe apellido, nombre, año y división; el sistema arma el curso. El mail no
se valida contra una lista.

Si se carga `Students`, tambien se habilita DNI + apellido como respaldo. Sin
padron, el DNI queda oculto.

Hay dos claves en Script Properties:

- `ADMIN_PIN`: profes. Puede administrar, importar, configurar y enviar mails.
- `GUIDE_PIN`: guias. Puede consultar, imprimir y marcar presentes, sin mails.

Profes y guias entran por la URL `/exec?admin=1` del Apps Script. La clave
viaja por POST con `google.script.run`; no se usa el enlace `?api=` de GitHub
Pages para administrar. El login publico muestra un aviso con esta indicacion.
Las APIs `apiAdmin*` rechazan JSONP sin `admin=1`.

La clave se guarda como token de 2 horas. Cinco fallos bloquean el acceso admin
15 minutos; los intentos por DNI se bloquean 2 minutos. Los PIN se generan de
6 digitos. `apiLookupDni` ya no devuelve el mail: entrega un ticket `l_` de un
solo uso. `apiGetData` y `apiRegister` piden sesion o ticket si el mail ya
tiene inscripciones. Los mails nuevos sin padron siguen siendo autodeclarados.

## Paneles

- Alumnos: elegir charlas, confirmar, descargar `.ics` y salir.
- Profes: por charla, incompletos, reportes, estado, inscriptos, lista de
  mails, correcciones, asistencia, configuracion y recordatorios.
- Guias: por charla, incompletos y reportes sin mails.

La asistencia funciona en celular a 360 px. El boton de presente vibra, se
puede deshacer durante 5 segundos y los toques sin conexion se reintentan. La
pestana Por charla guarda una copia local sin mails para seguir marcando si se
corta la conexion; el aviso indica la antiguedad de los datos.

## Correcciones manuales

La pestana Correcciones es solo para profes. Permite:

- Agregar un alumno con apellido, nombre, mail institucional, curso y una
  charla por horario, respetando ciclo y cupo.
- Corregir nombre, apellido o curso sin cambiar el mail.
- Mover una inscripcion a otra charla del mismo horario.
- Buscar duplicados por apellido, nombre y curso, y fusionar dos mails.
- Borrar todas las inscripciones de un mail.

Cada accion se registra en `Log` con fecha, tipo e ID. No se guardan mails
completos en el log. Los cambios se hacen bajo lock y respetan cupo, ciclo y
un horario por alumno.

## Modo ensayo y respaldo

`modo_prueba` marca las inscripciones nuevas como `prueba`. La franja "MODO
ENSAYO" aparece en todas las pantallas. El boton "Borrar datos de prueba" solo
elimina esas filas, pide escribir `BORRAR PRUEBA` y muestra el conteo.

`backup_activo` copia `Signups` a `Backup` cada 30 minutos y conserva las
ultimas 20 copias. Se activa o desactiva desde Configuracion o con
`apiAdminSetConfig`.

## Cierre y privacidad

"Cerrar evento" exporta el CSV, cierra la inscripcion y revoca sesiones.
"Borrar datos personales" exporta primero y deja solo contadores agregados:
no conserva mails, nombres, apellidos ni sesiones. Pide escribir `BORRAR`.

Se recomienda ejecutar el borrado pasados 30 dias del evento. La copia
`Backup` tambien se limpia en ese momento. Revisar antes las obligaciones de
guarda de la escuela.

## Recordatorios

La confirmacion incluye la casilla "Quiero recibir un mail de recordatorio",
desmarcada por defecto. Solo reciben el mail quienes la marcaron. El panel
muestra cuantos destinatarios hay, cuantos quedan pendientes y la cuota
disponible. El remitente es opcional; si se configura, se usa como `from` y
`replyTo`.

## Tests

```bash
node tests/esi-tests.js src
node tests/ui-smoke.js src
```

Sin dependencias. En Termux conviene bajarlos de prioridad:

```bash
nice -n 19 ionice -c 3 node tests/esi-tests.js src
nice -n 19 ionice -c 3 node tests/ui-smoke.js src
```

CI corre los dos tests en cada push a `main`.

## Publicar

```bash
scripts/push.sh
```

Luego revisar el workflow y Pages:

```bash
gh run list --limit 3
```

## Privacidad

- El alumno no guarda identidad en el dispositivo, solo el token de sesion.
- El DNI no se guarda en el dispositivo, reportes ni CSV.
- Los mails solo se muestran con clave de profe.
- La hoja `Mails` guarda mail, fecha y asunto; no guarda el cuerpo.
- `Log` guarda fecha, accion, ID y detalle acotado; no guarda mails completos.
- `Backup` guarda una copia temporal de inscripciones y se limpia al borrar
  los datos personales.
- `Sessions`, `Signups`, `Mails`, `Log` y `Backup` se comparten solo con
  profes autorizados.
- No versionar listas, CSV, claves ni tokens.

## Estructura

```text
src/Code.gs        backend de Apps Script
src/Panel.html     interfaz completa
index.html         copia publicada de Panel.html
assets/logo.png    logo oficial
tests/             tests de logica y smoke
scripts/push.sh    push autenticado a main
AGENTS.md          contexto completo para agentes
```

## Pendientes antes del evento

- Probar el ticket de login y el bloqueo de claves en el backend real.
- Probar correcciones, modo ensayo, cierre y borrado en una copia de la
  planilla, nunca sobre los datos reales.
- Verificar que el respaldo automatico corre y que `Backup` conserva 20 copias.

- Probar MailApp real, autorizacion, remitente y cuota para ~500 mails.
- Probar en un celular real el `.ics`, la asistencia offline, el PDF y los
  graficos a 360 px.
- Confirmar el texto de ESI de la direccion y cargarlo en `TEXTO_DIRECCION`.
- Revisar el orden definitivo de charlas y lugares.
- Rotar las claves si se compartieron.
