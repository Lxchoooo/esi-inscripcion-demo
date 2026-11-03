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

Si cambia `esi-mailer.gs`, se pega de nuevo entero en el editor del proyecto de
`esi@` y se guarda. El trigger sigue instalado; no hay que volver a correr
`setup()` salvo que se quiera reinstalar el trigger o mandar otra prueba.

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

- `esi-mailer.gs`: el proyecto completo (copiar y pegar en Apps Script).
- `tools/mailer/` en el repo `esi-inscripcion-demo`: la misma copia
  versionada, para que no se pierda si se reinstala Termux.
