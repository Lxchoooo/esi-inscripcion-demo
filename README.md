# Jornada ESI - Inscripcion a charlas

App para que los alumnos del Instituto Secundario Salsipuedes elijan una
charla por franja horaria. Incluye panel de profes, asistencia, reportes,
impresion, calendario y recordatorios por mail.

- Sitio: https://lxchoooo.github.io/esi-inscripcion-demo/
- Panel de profes: https://lxchoooo.github.io/esi-inscripcion-demo/?admin=1&demo=1
- Demo: https://lxchoooo.github.io/esi-inscripcion-demo/?demo=1

La documentacion tecnica completa, el estado actual, las decisiones y las
instrucciones para agentes estan en [AGENTS.md](AGENTS.md).

## Que incluye

- Acceso con mail institucional sin necesidad de padron.
- Acceso por DNI + apellido si se carga la hoja `Students`.
- Eleccion de tres charlas, una por horario, con control de cupo.
- Sesion opaca: el navegador guarda solo un token, no la identidad.
- Panel de profes con cupos, inscriptos, incompletos, reportes y graficos.
- Asistencia movil con filtros, deshacer y cola offline.
- Impresion A4 y exportacion CSV.
- Archivo `.ics` con las tres charlas y recordatorio 10 minutos antes.
- Recordatorios por mail por tandas, con control de cuota y sin reenvios.
- Configuracion de fecha y zona horaria desde el panel.

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
8. Entrar al panel con `?admin=1`.

Si la planilla ya existia, volver a ejecutar `setup()` para crear la hoja
`Mails` y las columnas nuevas.

## Acceso

El camino principal es el mail `@secundariosalsipuedes.edu.ar`. El alumno
escribe apellido, nombre, año y division; el sistema arma el curso. El mail no
se valida contra una lista.

Si se carga `Students`, tambien se habilita DNI + apellido como respaldo. Sin
padron, el DNI queda oculto.

Hay dos claves en Script Properties:

- `ADMIN_PIN`: profes. Puede administrar, importar, configurar y enviar mails.
- `GUIDE_PIN`: guias. Puede consultar, imprimir y marcar presentes, sin mails.

## Paneles

- Alumnos: elegir charlas, confirmar, descargar `.ics` y salir.
- Profes: por charla, incompletos, reportes, inscriptos, lista de mails,
  asistencia, configuracion y recordatorios.
- Guias: por charla, incompletos y reportes sin mails.

La asistencia funciona en celular a 360 px. El boton de presente vibra, se
puede deshacer durante 5 segundos y los toques sin conexion se reintentan.

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

- Probar MailApp real, autorizacion y cuota para ~500 mails.
- Probar en un celular real el `.ics`, la asistencia offline, el PDF y los
  graficos a 360 px.
- Confirmar el texto de ESI de la direccion y cargarlo en `TEXTO_DIRECCION`.
- Revisar el orden definitivo de charlas y lugares.
- Rotar las claves si se compartieron.
