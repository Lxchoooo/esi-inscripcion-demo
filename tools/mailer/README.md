# Robot de mails ESI en la nube (sin Termux y sin tokens)

Objetivo: que los mails de la cola salgan desde
`esi@secundariosalsipuedes.edu.ar` sin depender de Termux/Android y **sin
regenerar refrescadores a mano**. El proyecto corre dentro de la cuenta
institucional: Google lo ejecuta cada minuto y `GmailApp` manda como `esi@`.

## Por que no alcanza con el token del Playground

La via Gmail API del Playground funciona, pero el `refresh_token` lo revoca
Google cada tanto (`invalid_grant: Token has been expired or revoked`) y hay
que volver a generarlo desde el navegador. Paso de verdad el 3/11/2026: el
token del dueno murio en menos de 24 h y la cola quedo frenada. Apps Script no
usa tokens: la autorizacion la administra la propia cuenta.

## Opcion recomendada (una sola vez, ~3 minutos)

Pasos, desde el navegador con la cuenta **esi@**:

1. **Compartir la planilla** de la jornada con `esi@` como **Editor** (la
   comparte el dueno del panel). Sin esto, el paso 4 avisa "no puedo abrir la
   planilla".
2. Entrar a <https://script.google.com> y crear **Nuevo proyecto**.
3. Borrar el `Codigo.gs` de ejemplo y pegar todo `esi-mailer.gs`. Guardar.
4. Elegir la funcion **`setup`** y tocar **Ejecutar**. Autorizar Sheets y
   Gmail cuando lo pida. `setup()`:
   - verifica que puede abrir `MailQueue`,
   - instala el trigger `flushQueue` cada 1 minuto (idempotente),
   - manda un mail de prueba a `esi@`.
5. Revisar **Ejecuciones**: `setup OK`. Opcional: correr **`diagnostico`** (o `prueba("tu@mail")` para confirmar que llega afuera)
   para ver filas por estado y el trigger.

Cuando el trigger corre, toma las filas `pendiente` vencidas, las reclama como
`cola_nube` (asi el trigger viejo de la webapp no las toca), manda y marca
`enviado`. Si el proceso muere, a los 5 minutos retoma las `cola_nube`; a los
5 intentos fallidos la fila queda `error`. Si Gmail devuelve cuota agotada, la
fila vuelve a `pendiente` **sin gastar intento** y sigue en el proximo minuto.

Cada corrida deja un latido en las propiedades del script (`MAIL_HEARTBEAT`)
con hora, enviados, errores y si hubo corte por cuota. `diagnostico()` lo
muestra como `latido`, asi se ve si el trigger esta vivo sin abrir la hoja.

## Actualizar el codigo

Cada push a `main` que toque `tools/mailer/esi-mailer.gs` lo publica solo en el
proyecto de `esi@` con la Apps Script API (`.github/workflows/mailer-deploy.yml`
+ `scripts/deploy-mailer-api.sh`). No hay que abrir el editor ni copiar/pegar.

El trigger de cada minuto ejecuta el contenido nuevo sin redeploy: los triggers
de Apps Script corren el HEAD del proyecto, no una version publicada. No hay que
volver a correr `setup()` salvo que se quiera reinstalar el trigger o mandar
otra prueba.

### Configuracion por unica vez (cuenta `esi@`)

1. **Activar la Apps Script API** para `esi@`: entrar a
   <https://script.google.com/home/usersettings> con esa cuenta y poner en
   "on" la opcion **Google Apps Script API**. Sin esto la API contesta 403.
2. **Sacar el ID del proyecto**: abrir el proyecto del robot en
   <https://script.google.com> y copiar el ID que aparece en la URL, entre
   `/projects/` y `/edit` (es un texto largo, no es secreto).
3. **Generar un refresh token con permiso de publicar**: entrar al
   <https://developers.google.com/oauthplayground/> con la cuenta `esi@`, en
   el paso 1 pegar el scope
   `https://www.googleapis.com/auth/script.projects`, tocar **Authorize APIs**
   y en el paso 2 **Exchange authorization code for tokens**. Copiar el
   **Refresh token**. Es un secreto: no va al repo ni al chat.
4. **Guardarlo en GitHub** (desde Termux, con `gh` autenticado como dueno del
   repo; el token se pega y no queda en el historial):

   ```sh
   gh variable set ESI_SCRIPT_ID --body '<ID-del-proyecto>'
   gh secret set ESI_REFRESH_TOKEN   # pegar el refresh token y Enter
   ```

5. **Probar**: `gh workflow run mailer-deploy.yml` y mirar el run. Si dice
   `robot actualizado en esi@: Codigo.gs`, el proyecto ya tiene la ultima
   version. Despues abrir el editor y correr `diagnostico()`: el `latido` tiene
   que seguir avanzando cada minuto.

El workflow **no imprime el token** y solo pide el scope `script.projects`
(no puede mandar mails ni leer la planilla: eso lo hace el robot con la
autorizacion propia de `esi@`). Si el proyecto tuviera mas de un archivo `.gs`,
el script frena en vez de adivinar cual es el robot.

Si el colegio bloquea la API o el scope, el plan B sigue siendo pegar
`esi-mailer.gs` entero una vez en el editor y guardar.

## Apagar el poller de Termux

Cuando el cloud runner este andando:

```sh
pkill -f supervisor.sh
pkill -f poller.mjs
```

Opcional, para no dejar dos caminos de envio: borrar el trigger
`flushMailQueue_` del proyecto viejo de la webapp (Apps Script → Activadores).
Dejarlo no rompe nada: la webapp no tiene permiso de red y corta el lote sin
marcar las filas.

## Verificacion

- El mail de prueba de `setup()` llega a la bandeja de `esi@`.
- `diagnostico()` muestra `trigger: true` y las filas `pendiente` bajando.
- Desde afuera, el diagnostico publico del panel sigue sirviendo:
  `https://script.google.com/macros/s/<deploy>/exec?fn=apiMailDiag` → `queue`
  con 0 pendientes vencidos.

## Opcion alternativa: Cloudflare Worker + cron

Un Worker con cron cada minuto puede leer la cola con la API de Sheets y
mandar con la API de Gmail usando el refresh token institucional. Es gratis,
pero requiere cuenta de Cloudflare, `wrangler` y guardar los tokens como
secretos. No se implemento porque la opcion de Apps Script no necesita nada
externo y no caduca.

## Archivos

- `esi-mailer.gs`: el proyecto completo. Es la fuente: el workflow lo publica
  solo en `esi@` con la Apps Script API.
- `../../scripts/deploy-mailer-api.sh`: el que hace el PUT a la API (tambien
  sirve a mano con `ESI_REFRESH_TOKEN` y `ESI_SCRIPT_ID` en el entorno).
- `../../.github/workflows/mailer-deploy.yml`: dispara el deploy cuando cambia
  el `.gs` en `main`.
- `tools/mailer/` en el repo `esi-inscripcion-demo`: la misma copia
  versionada, para que no se pierda si se reinstala Termux.
