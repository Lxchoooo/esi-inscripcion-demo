# AGENTS.md - ESI Inscripcion

Este archivo es el contexto principal para cualquier agente o subagente que
trabaje en este repo. El resumen para personas y otras IA vive fuera del repo,
en `/storage/emulated/0/esi-inscripcion/RESUMEN-PARA-OTRA-IA.txt`.

## Proyecto

App de inscripcion a la Jornada ESI del Instituto Secundario Salsipuedes.
El alumno entra con mail institucional (o DNI + apellido si hay padron), elige
una charla por franja y queda anotado. El profe administra cupos, asistencia,
reportes, recordatorios y configuracion. La guia consulta y marca presentes sin
ver mails.

- Repo: `Lxchoooo/esi-inscripcion-demo`
- Sitio: https://lxchoooo.github.io/esi-inscripcion-demo/
- Panel: https://lxchoooo.github.io/esi-inscripcion-demo/?admin=1&demo=1
- Demo: https://lxchoooo.github.io/esi-inscripcion-demo/?demo=1
- Evento: 4 de noviembre de 2026, ~500 alumnos.
- Stack: Google Apps Script + Google Sheets + HTML/CSS/JS plano.
- Sin dependencias de Node ni build step.

## Estado actual

- Ronda 10 en `main`. La ronda 10 agrega acceso sin padron, reportes desde
  `Signups`, ESI, logo oficial, `.ics`, verificacion movil, recordatorios,
  configuracion de evento y deduplicacion de mails.
- Tests locales: 99 passed, 0 failed. UI smoke: OK.
- CI: workflow `tests` y Pages corren en cada push a `main`.
- MailApp real, descarga `.ics`, Wake Lock, offline y tacto en dispositivo
  siguen sin verificarse en un telefono real.
- `TEXTO_DIRECCION` esta vacio: la tarjeta ESI "Por que esta jornada" queda
  oculta hasta que la direccion entregue el texto.

## Rutas

Repo local de trabajo:

```text
/data/data/com.termux/files/usr/tmp/opencode/esi-r9
```

Copias para editar en Termux:

```text
/data/data/com.termux/files/home/proyecto/esi-panel/Code.gs
/data/data/com.termux/files/home/proyecto/esi-panel/Panel.html
/data/data/com.termux/files/home/proyecto/esi-panel/web/index.html
/data/data/com.termux/files/home/proyecto/esi-panel/web/assets/logo.png
/data/data/com.termux/files/home/proyecto/esi-panel/README.md
/data/data/com.termux/files/home/proyecto/build/esi-tests.js
/data/data/com.termux/files/home/proyecto/build/ui-smoke.js
```

Resumen y bitacora compartidos:

```text
/storage/emulated/0/esi-inscripcion/RESUMEN-PARA-OTRA-IA.txt
/storage/emulated/0/esi-inscripcion/esi-inscripcion-cambios.txt
```

## Archivos del repo

- `src/Code.gs`: backend Apps Script, APIs, auth, datos, reportes, mails.
- `src/Panel.html`: toda la interfaz alumno/admin, CSS y JS inline.
- `index.html`: copia literal de `src/Panel.html` para GitHub Pages.
- `assets/logo.png`: logo oficial. No hay base64 de respaldo.
- `tests/esi-tests.js`: tests de logica, backend, contrato y contenido.
- `tests/ui-smoke.js`: smoke de interfaz con DOM simulado.
- `src/appsscript.json`: manifiesto de Apps Script.
- `.github/workflows/tests.yml`: tests en push y PR.
- `AGENTS.md`: este archivo.
- `README.md`: guia corta para personas.

## Reglas criticas

- `index.html` debe ser copia byte a byte de `src/Panel.html`.
- No agregar dependencias ni frameworks. Apps Script + JS plano.
- No commitear listas, CSV, claves, tokens ni keystores.
- No hardcodear rutas de la maquina fuera de este archivo; usar constantes.
- No usar `git reset --hard`, `git clean`, `rm -rf` sobre home/root ni `sudo`.
- Un commit por tema, en espanol, prefijo `feat:`, `fix:`, `docs:` o `test:`.
- Verificar antes de afirmar que algo funciona.
- No prometer que la ronda esta publicada hasta confirmar Pages.
- No usar datos reales de alumnos en demo ni en tests.

## Modelo de datos

Hojas de Google Sheets:

- `Config`: `clave`, `valor`. Claves: `evento_abierto`, `evento_fecha`,
  `evento_zona`.
- `Slots`: `id`, `nombre`, `inicio`, `fin`, `orden`.
- `Talks`: `id`, `titulo`, `ciclo`, `slot_id`, `lugar`, `cupo`, `activa`.
- `Students`: legado. `email`, `apellido`, `nombre`, `curso`, `dni` opcional.
- `Signups`: `id`, `ts`, `email`, `nombre`, `curso`, `ciclo`, `slot_id`,
  `talk_id`, `presente`, `apellido`. Las dos ultimas se agregan al final.
- `Sessions`: hash del token, mail, nombre, apellido, curso, ciclo, emision,
  vencimiento y revocacion. Nunca guardar el token crudo.
- `Mails`: `email`, `fecha`, `asunto`. Evita reenviar el mismo recordatorio.

Migraciones: solo aditivas. No borrar filas ni hojas. Si la planilla ya
existia, volver a ejecutar `setup()` crea `Mails` y las columnas faltantes.

## Evento

- 3 franjas: 10:30-11:20, 11:30-12:20, 12:30-13:30.
- Basico 1-3: B1-B10. Orientado 4-6: O1-O9.
- Divisiones 1-3: A/B. Divisiones 4-6: Turismo/Economia.
- Cupo 40 por charla. El ciclo se deduce del año.
- No hay disertante. No inventar nombres.
- Fecha y zona por defecto: `2026-11-04`, `America/Argentina/Cordoba`.
- La configuracion se puede editar desde el panel de profes.

## Acceso del alumno

- Principal: mail `@secundariosalsipuedes.edu.ar`. No se valida contra padron.
  El alumno escribe apellido, nombre, año y division.
- Si hay `Students`, aparece DNI + apellido como respaldo.
- Sin padron, DNI y botones relacionados quedan ocultos.
- Validacion: nombre 2-60, apellido 2-60, dominio institucional.
- La sesion local es solo `esi_session`, token opaco `s_` + 64 hex.
- `apiResumeSession` reanuda. `Salir`, `Cambiar datos` y `No soy yo` revocan.
- Vencimiento: 7 dias o 24 horas despues del evento, lo que ocurra antes.

## Roles

- `ADMIN_PIN`: profe. Todo, importar, borrar, configurar, mails.
- `GUIDE_PIN`: guia. Lee, reportes, asistencia; sin mails ni escrituras
  administrativas.
- La clave se cambia por token de 2 horas. Cinco fallos bloquean 60 segundos.
- El backend aplica permisos; la UI solo los refleja.

## APIs principales

- Publicas: `apiBootstrap`, `apiLookup`, `apiGetData`, `apiResumeSession`,
  `apiStudentLogout`, `apiRegister`.
- Admin: `apiAdminLogin`, `apiAdminGetData`, `apiAdminSetOpen`,
  `apiAdminDeleteSignup`, `apiAdminImportRoster`, `apiAdminTalkRoster`,
  `apiAdminPending`, `apiAdminSetPresent`, `apiAdminReports`,
  `apiAdminMailPreview`, `apiAdminSendReminders`, `apiAdminGetConfig`,
  `apiAdminSetConfig`.
- Todas devuelven objetos con `ok` y `message` cuando fallan.
- Los cambios de datos invalidan la cache. TTL de cache: 12 segundos.

## Reportes

- Se calculan desde `Signups`, no desde `Students`.
- Inscriptos: mails unicos con al menos una eleccion.
- Completos: 3 franjas. Incompletos: 1 o 2. Missing: 0.
- Presentes/ausentes: columna `presente`.
- `apiAdminPending`: solo incompletos.
- `apiAdminReports`: totales, cursos, charlas, por ciclo y por franja.
- La guia nunca recibe mails.
- Graficos SVG/CSS con tabla alternativa y numeros visibles.
- Impresion A4, una pagina por curso o charla, columna de firma.

## Verificacion movil

- Selector agrupado por horario y busqueda por apellido/nombre.
- Contador `Presentes X de Y` y chips Todos/Presentes/Faltan.
- Filas de 56 px, nombre `Apellido, Nombre`, boton grande de presente.
- Vibracion, aviso `Marcado` con `Deshacer` 5 segundos.
- Cola offline `esi_mark_queue` con id de inscripcion y estado. Sin mails.
- Wake Lock al entrar al panel; se libera al salir.
- Refresh cada 30 segundos, pausado con la pestana oculta.

## Recordatorios

- `apiAdminMailPreview`: destinatarios, pendientes, asunto, cuerpo de muestra,
  cuota, lote y evento.
- `apiAdminSendReminders`: tandas de 20, maximo 40, via `MailApp`.
- Solo mails con al menos una eleccion.
- La hoja `Mails` deduplica por mail + asunto.
- Si falta `Mails`, pide ejecutar `setup()` y no envia.
- Asunto: `Recordatorio: Jornada ESI 2026 del 4 de noviembre de 2026`.
- El cuerpo incluye las tres franjas, la charla elegida o el faltante.
- No registrar cuerpos ni mails en logs.
- MailApp real sigue sin probarse.

## Calendario

- Boton `.ics` en el resumen y en la confirmacion.
- Un `VEVENT` por charla, `America/Argentina/Cordoba`, alarma 10 minutos.
- UID sin mail ni datos personales.

## ESI y UI

- Seccion ESI antes de FAQ. Cinco tarjetas visibles.
- `TEXTO_DIRECCION` vacio oculta "Por que esta jornada".
- Logo oficial. Paleta verde con contraste claro/oscuro.
- Movil 360 px: una columna, targets de 44 px, inputs de 16 px.
- Sin emojis, sin signos de exclamacion, sin guiones largos.
- Voseo rioplatense.

## Tests y CI

Local:

```bash
node tests/esi-tests.js src
node tests/ui-smoke.js src
```

En Termux:

```bash
nice -n 19 ionice -c 3 node tests/esi-tests.js src
nice -n 19 ionice -c 3 node tests/ui-smoke.js src
```

Sintaxis de Apps Script:

```bash
cp src/Code.gs build/Code.check.js
node --check build/Code.check.js
rm build/Code.check.js
```

CI: `.github/workflows/tests.yml` con Node 20. Pages se despliega por separado.
No asumir que un test local cubre la version de Node de CI. Evitar APIs de
navegador sin guardas; por ejemplo `typeof navigator !== 'undefined'`.

## Publicacion rapida

El remoto es `Lxchoooo/esi-inscripcion-demo`. Para pushear sin volver a
escribir el helper de credenciales:

```bash
scripts/push.sh
```

Ese script usa `gh auth token` y hace push de `HEAD` a `main`. No esperar
`gh run watch` bloqueando la conversacion: pushear, consultar el run con
`gh run list` y seguir trabajando. Verificar al final:

```bash
gh run list --limit 3
gh run view <id> --log-failed
curl -sL "https://lxchoooo.github.io/esi-inscripcion-demo/?v=$(date +%s)" | grep -c "Instituto Secundario Salsipuedes"
```

Pages tarda uno o dos minutos. Usar `?v=<timestamp>` para evitar cache.

## Sincronizacion local

Despues de un cambio verificado:

```bash
cp src/Code.gs /data/data/com.termux/files/home/proyecto/esi-panel/Code.gs
cp src/Panel.html /data/data/com.termux/files/home/proyecto/esi-panel/Panel.html
cp index.html /data/data/com.termux/files/home/proyecto/esi-panel/web/index.html
cp assets/logo.png /data/data/com.termux/files/home/proyecto/esi-panel/web/assets/logo.png
cp README.md /data/data/com.termux/files/home/proyecto/esi-panel/README.md
cp README.md /data/data/com.termux/files/home/proyecto/esi-panel/web/README.md
cp tests/esi-tests.js /data/data/com.termux/files/home/proyecto/build/esi-tests.js
cp tests/ui-smoke.js /data/data/com.termux/files/home/proyecto/build/ui-smoke.js
```

Actualizar tambien `AGENTS.md` y el resumen compartido cuando cambie el estado.

## Agentes y subagentes

- Todo agente debe leer este archivo antes de tocar el repo.
- Para cambios chicos, trabajar directo; no delegar.
- Para investigaciones independientes, usar subagentes `explore` o `general`
  con un prompt que incluya rutas, objetivo y criterio de salida.
- Los subagentes no comparten el contexto de la conversacion. Pasarles el
  contenido relevante de este archivo o pedirles que lo lean.
- No delegar commits, push, deploy ni cambios destructivos.
- Dividir el trabajo en paralelo solo si los archivos no se pisan.
- Antes de cerrar, pedir al subagente un resumen con archivos tocados, tests
  ejecutados y riesgos; verificar localmente, no confiar solo en su reporte.
- Tareas tipicas delegables: revisar tests, buscar usos de una API, revisar
  accesibilidad, comparar `index.html` con `Panel.html`, buscar textos
  desactualizados.
- Tareas no delegables: push, configuracion de secretos, migraciones de datos,
  cambios de permisos, borrado de filas.

## Pendientes y riesgos

- Probar MailApp real: autorizacion, cuota para ~500 mails y envio por tandas.
- Probar en celular real: `.ics`, tacto 360 px, teclado, Wake Lock, cola
  offline, graficos, modo oscuro y PDF.
- Confirmar `TEXTO_DIRECCION` con la direccion.
- Volver a ejecutar `setup()` en la planilla real para crear `Mails`.
- Revisar orden definitivo de charlas y lugares.
- Rotar claves si se compartieron o si se reutilizo `1234`.

## Decisiones y supuestos

- "Solo anotados" para recordatorios significa al menos una eleccion.
- Sin padron, el mail es una declaracion; no se valida pertenencia.
- La ultima escritura gana en asistencia; la cola offline se aplica encima.
- La sesion no se renueva por uso.
- Los datos de demo pueden incluir DNI en localStorage; no usar lista real.
