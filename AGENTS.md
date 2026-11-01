# AGENTS.md - ESI Inscripcion

App de inscripcion a la Jornada ESI del Instituto Secundario Salsipuedes:
Google Apps Script + Google Sheets + HTML/CSS/JS plano, sin build ni
dependencias. El alumno elige una charla por franja; el profe administra y la
guia marca presentes sin ver mails.

- Repo: `Lxchoooo/esi-inscripcion-demo`
- `README.md` es la portada para personas; los agentes se guian por este archivo.
- Sitio: https://lxchoooo.github.io/esi-inscripcion-demo/
- Panel real: `/exec?admin=1` del Apps Script, no GitHub Pages.
- Evento: 4/11/2026, ~500 alumnos, dominio `@secundariosalsipuedes.edu.ar`.
- Estado: v68 en `main` (panel/backend `v68`; deployment activo `AKfycbwkl...` republicado, verificado vivo por curl). Ronda 34 (v68): rendimiento de la interacción: el toque que llega mientras el server confirma YA NO muere en silencio (queda en cola con timestamp y se abre solo al terminar la request; la cola vence a los 5 s para no abrir el sheet spontáneamente); la charla elegida late suave con chip "Confirmando…" hasta que el server contesta (6 ciclos — r14 prohíbe animaciones infinitas salvo la del skeleton); busy se apaga SOLO vía sUnbusy_ (sRegister y sEnterPanel no tocan más busy a mano). Drill: "Sin lugares" NO es un error — es el cupo cortando en 40 (18 altas OK = la charla ya tenía 22); test r33 clava borradas==anotadas en entorno controlado; el "borradas 12 vs 18" reportado en producción queda por verificar en panel (si hay filas de ensayo pegadas, una pasada de Borrar datos de prueba las limpia). Ronda 33 (v67): la hora del acceso ancla -3 a prueba de todo: ademas del formateo al escribir, la columna fecha del registro es TEXTO con setNumberFormat('@') — Sheets auto-parsea strings tipo '1/11/2026 17:02' con el TZ de la HOJA y la volvia a correr ~3 h (off real reportado en produccion); la huella de pantalla queda DESCARTADA por decision del dueno (aUADesc_ usa userAgentData + rescate del UA crudo; si el OEM no da el modelo sale solo OS + navegador). Ronda 32 (v66): acabo la ronda de v65: la hora REAL del acceso se graba formateada al escribir (logAccess_ con America/Argentina/Cordoba; la re-lectura de Date por la hoja desplazaba ~8h en produccion reivindicada por el usuario) y al leer acepta string (nueva) o Date (vieja, Buenos_Aires); el modelo del dispositivo con TRES fuentes: userAgentData (model+platformVersion+fullVersionList), rescate del modelo del UA crudo, y como huella final la resolucion fisica de pantalla (pantallaRes_ = px x dpr) — el OEM de cel puede no dar el modelo por privacidad, entonces queda huella 1080x2400 estilo. Ronda 31 (v65): registro de accesos del admin mas util — dispositivo con modelo real y version de Android via userAgentData.getHighEntropyValues (el UA reducido de Chrome manda 'K' en vez del modelo; fallback al UA crudo para ingresos viejos, aUAShort_ reparsea), Chrome con version (Chrome 130), y fecha del acceso formateada por el server en hora argentina (-3, America/Argentina/Buenos_Aires) en vez de ISO UTC (antes dependia del reloj de quien miraba; panel acepta filas viejas en ISO). Ronda 30 (v64): auditoria del PANEL (2 reviewers, 10 hallazgos unicos) — sConfirmar ya no marca "Listo" durante una request y el rechazo/catch del registro revierte el estado confirmado (H1); aAuthLost (sesion admin vencida) agregado a carga de charla/pendientes, guardar config y enviar recordatorios (H2); el banner de limpieza del simulacro respeta ok:false del backend v63 (H3); el borrado de datos personales limpia caches admin de localStorage y aPendingData en memoria (H4); banners con generacion (aBannerSeq_) para que el deshacer no borre errores ajenos (H5); CSV quote-aware en parseRoster (backend Y demo): campos con comillas conservan comas internas ("Gomez Jacoby, Ana Belen") (F5, en vivo); CSS var inexistente --ink-soft → --muted (F2); sel-bar z-index 50→85 para no quedar tapada por el banner (F3); el picker demo cuenta cupo igual que cupoCounts_ (filas prueba no gastan) (F4); clave duplicada recordatorio en sEmptyState_ (F6). Ronda 29 (v63): auditoria de Code.gs (2 reviewers, 12 hallazgos), arreglos: runPendingRebuilds_ deja rastro en el Log y reintenta (cap 3) en vez de tragarse el error y limpiar la marca; withLockIfFree_ ya NO corre sin lock si esta ocupado (devuelve null); drillCleanupTodos_/drillCleanup_ borran bajo lock y devuelven -1 ocupado; bienvenida se manda UNA vez por alumno (mailHistoria_; el cambio de charla tras envio ya no repite la bienvenida completa, solo el mail corto); empujon del diag con cooldown de 60 s y sin mail del remitente en salida publica (remitente_activo: bool); import de padron setValues con ancho exacto 5 (antes MismatchedDimension dejaba la hoja sin filas). Descartados: apiLookupDni cache (el import invalida) y lecturas admin de solo lectura. Anotado sin cambiar: DNI en apiAdminPending visible para guias (decision de producto, test lo exige). Ronda 28 (v62): mails mas rapidos — gracia de la cola 2 min → 45 s (agrupa cambios en rafaga) y watchdog empujador de la cola cada 2 min (antes 5). Ronda 27: mails de bienvenida verificadas EN VIVO via `apiMailDiag`: MailApp autorizado (cuota 95), el registro encola la fila, el trigger de cada minuto de Google NO ejecuta el flush (fila con `intentos 0` pasados 10 min), el empujon manual del diagnostico (`args='empujar'`) mando el mail real (`sent:1`, fila `enviado`) y el usuario CONFIRMO la recepcion de la bienvenida y del aviso de cambio (primera prueba real de MailApp, cerrada el 1/11/2026). Como red de seguridad el watchdog tambien empuja `flushMailQueue_`. Ronda 26 (v59): eleccion optimista de charlas (verde y animacion en el mismo tick del tap; el server confirma en fondo y corrige la vista; si rechaza, revierte con aviso), sin cartel de "listo" en cada seleccion, carteles del alumno (`#s-banner`) y toasts fijados al pie para verse sin scroll, y el registro confirma guardando cache del device. `apiMailDiag` (v58): endpoint publico de diagnostico de la cola de avisos (estados agregados, sin datos personales). Ronda 25 (v57), caza de errores sobre todo el codebase del panel y del backend: cupos del admin (`apiAdminAddStudent`/`apiAdminMoveTalk`) cuentan como el alumno via `cupoCounts_` (las filas de ensayo no bloquean cupo en el evento real); la inscripcion del alumno deja la marca `rebuild_derived_pending` y `maybeRebuildReport_` la consume en el proximo arranque del panel (antes Reporte/Alumnos quedaban viejos tras un cambio de charla: el fingerprint no cambiaba y no habia agenda); `flushMailQueue_` corre bajo `tryLock` (sin doble envio por trigger + watchdog solapados) y si esta ocupado sale con `lock: 'ocupado'`; el log `mail_ensayo_alumno` ya no guarda el mail crudo; el watchdog reponе ademas `Students`, `Errors`, `Config` y el default `avisos_mail`, y solo anuncia el trigger si de verdad lo creo; el simulacro de carga corre bajo un solo lock; `ensureMailQueueTrigger_` devuelve booleano. Panel: las marcas de presentes de Reporte se desencolan al confirmar el server (se quedaban reintenteando); el restore de sesion de admin en `aInit` arranca `aStartAutoRefresh` y se elimino el poller doble de 30 s; el resume-fail del alumno con cache vivo ya no patea a login (queda en su pantalla con banner); el cache del device del resume solo sirve si es del mismo mail (celulares compartidos); `needsLogin`/vencido del registro borra el cache del device (`sClearStudentSession_`); `sRefreshQuiet_` manda el token de login como sexto arg, revalida confirmed y guarda cache fresco; `aLoad` actualiza `aUpdatedAt` (la etiqueta "actualizado hace Ns" dejo de quedar congelada); el cache por charla respeta el TTL de 6 h; singular "1 mail"; el demo devuelve `added` como lista como el backend real y su cupo iguala a `cupoCounts_`. Tests 275/0, smoke OK, CI verificado post-push. MailApp sigue sin probarse en dispositivo. Ronda previa (v56): al reentrar ya inscripto se rellena siempre la pantalla listo via `sRenderDone_()` y al cerrar sesion del alumno se borra tambien `esi_last_data`. Ronda 23 v55 + cache SWR de v53/v54 y watchdog r22, todo en bandas anteriores de este mismo estado.
  activo `AKfycbwkl...` republicado a @68). Ronda 18: borrado rapido en el
  panel: Reporte y Alumnos no se reconstruyen dentro del alta o del borrado
  (antes frenaban la respuesta); el borrado solo deja la marca
  `rebuild_derived_pending` y la corrida del trigger de la cola la consume
  bajo lock una vez por minuto. El borrado de inscripcion muestra banner de
  estado (`wip`, dos pulsos) y actualiza la lista y el contador de cupo
  localmente, sin pedir el panel entero. "Borrar alumno" ya no pide el mail
  a mano: dentro de la hoja hay lista de inscriptos (ordenada por apellido,
  con curso y cantidad de charlas) y un segundo paso con la eleccion
  separada: borrar una sola charla con su confirmacion, o el alumno completo
  (apiAdminDeleteStudent) con la suya; ambas aplican el update local y
  re-render. "Avisos por mail" sigue la ronda 17. Tests 248/0, smoke OK, CI
  y Pages verdes. Backend real sin deployar hasta la republicacion de esta
  ronda; MailApp y dispositivo siguen sin probarse. De la ronda 17: avisos por
  mail a cada alumno; la bienvenida (ESI, Ley 26.150, lineas 102/144/0800,
  charlas con horario y lugar) sale como maximo 2 min despues de completar
  las tres franjas (cola `MailQueue` + trigger cada 1 min, gracia
  `MAIL_QUEUE_GRACE_MS`, tope 20 por corrida, 5 reintentos a `error`); si
  cambia una charla con la bienvenida pendiente se re-escribe la fila sin
  duplicar, y si ya salio, se manda un mail corto solo del cambio. Switch
  `avisos_mail` en Config (default `si`); en modo ensayo va a la casilla del
  remitente; el borrado de datos personales vacia la cola. Mejoras de ronda 16: los
  horarios
  se leen del texto visible de la hoja
  (`getDisplayValues`, no del instante) porque las celdas de hora viven con
  fecha base 1899-12-30 y formatear por zona aplicaba el offset historico
  (mostraba `8:13` en vez de `10:30`); el logo del encabezado usa URL absoluta
  a Pages para verse tambien en `/exec`; el alumno puede cerrar sesion con un
  boton minimo al fondo de la pantalla de charlas, con doble toque
  (`btn-alumno-salir`, `panel-exit`). Ademas: un solo panel con la misma
  clave para guias, preceptores y profes; pantalla "Listo para el evento" de
  solo lectura con 9 controles; docs del dia; tests 239/0, smoke OK, CI y
  Pages verdes. Backend real sin deployar; MailApp y dispositivo siguen sin
  probarse. De la ronda anterior: sesion que se borra al vencer, ticket
  consumido antes de emitir la sesion, asistencias encoladas antes de la
  request y guardadas por lote, cambio de charla que desmarca la asistencia,
  `presente` por encabezado, tope sticky medido en `--nav-h`, manifest con
  192x192 y maskable.

## Donde trabajar

- Checkout completo en `~/repos/esi-inscripcion-demo`: `.git`, `src/Code.gs`,
  `src/Panel.html`, `index.html` y `tests/`. Recuperar con
  `esi-restore esi-inscripcion-demo [rama]`. Los clones temporales bajo
  `/data/data/com.termux/files/usr/tmp/opencode` pueden desaparecer.
- No pushear desde clones temporales sin `.git` completo.
- Tests: `tests/esi-tests.js` y `tests/ui-smoke.js` del repositorio.

## Comandos

Desde el checkout completo:

```bash
node tests/esi-tests.js src
node tests/ui-smoke.js src
```

Simulacro de carga, solo contra el `/exec` de una COPIA de la planilla (escribe
filas reales; sin `--copia-ok` se niega). La clave va por entorno, nunca por
argumento; el log queda en `build/loadtest.log`, que no se versiona:

```bash
node scripts/loadtest.js <url-exec-de-la-copia> --alumnos 50 --rampa 10,30,50 --copia-ok
ESI_ADMIN_KEY=<clave-admin> node scripts/loadtest.js <url> --copia-ok   # verifica invariantes
```

En Termux, bajar prioridad:

```bash
nice -n 19 ionice -c 3 node tests/esi-tests.js src
nice -n 19 ionice -c 3 node tests/ui-smoke.js src
```

Sintaxis de Apps Script (no acepta `.gs` directo):

```bash
cp src/Code.gs build/Code.check.js
node --check build/Code.check.js
rm build/Code.check.js
```

Publicar desde el checkout completo:

```bash
scripts/push.sh
gh run list --limit 3
gh run view <id> --log-failed
```

`scripts/push.sh` corre tests, smoke y `cmp src/Panel.html index.html` antes de
usar `gh auth token` y hacer push de `HEAD` a `main`; `SKIP_TESTS=1` saltea el
control. No bloquear la conversacion con `gh run watch`; consultar el run y
seguir.

`index.html` es la copia publicada y debe ser identica a `src/Panel.html`
(`cp src/Panel.html index.html`). Para el deploy de Apps Script hay una version
comprimida opcional:

```bash
node scripts/minify.js   # genera build/index.min.html (CSS comprimido, JS sin indentar, -15%)
```

El minificador valida la sintaxis del JS con `vm.Script` y verifica marcadores
clave; si falla, no escribe nada. Ese archivo se copia como `Panel.html` en el
proyecto de clasp; nunca reemplaza a `index.html`. Tests y CI siguen corriendo
contra `src/`.

El proyecto de clasp se arma asi, y el manifiesto tiene que ser **el del repo**
(copiarlo a mano sin `webapp` rompe el deployment y `/exec` devuelve 404):

```bash
cp src/Code.gs Code.js
cp build/index.min.html Panel.html
cp src/appsscript.json appsscript.json   # incluye "webapp": executeAs/access
```
Verificar Pages con cachebuster:

```bash
curl -fsSL "https://lxchoooo.github.io/esi-inscripcion-demo/?v=$(date +%s)" \
  | grep -c "Instituto Secundario Salsipuedes"
```

## Arquitectura

- `src/Code.gs` es el backend unico; `src/Panel.html` contiene toda la UI, CSS
  y JS inline. `index.html` es la copia publicada para Pages.
- El transporte real usa `google.script.run`; la demo usa JSONP/localStorage.
  `API_FN_MAP_` es la lista de APIs expuestas. Si agregas una API, sumala al
  mapa y a los tests; hoy hay 31. El test compara el mapa contra las
  `function api*` del fuente en las dos direcciones.
- Cache en `CacheService` con TTL de 12 s. Toda escritura debe invalidarla.
  Las operaciones de escritura usan `LockService`; no leer datos crudos fuera
  del lock.
- Hojas: `Config`, `Slots`, `Talks`, `Students` (legado), `Signups`,
  `Sessions`, `Mails`, `MailQueue` (cola de avisos con gracia de 2 min),
  `Log`, `Backup`, `Resumen` (agregados del borrado).
- `Signups` incluye `presente`, `apellido`, `recordatorio` y `prueba`.
  `setup()` crea hojas/columnas faltantes y el trigger de respaldo cada 30
  minutos; `Backup` conserva 20 copias. Las migraciones son aditivas, salvo el
  borrado de datos personales pedido por un admin.
- Invariantes de negocio: una charla por franja, ciclo correcto, cupo 40,
  charla activa y un solo alumno por mail. El backend revalida; la UI no
  alcanza.
- Privacidad: la API publica solo devuelve datos propios; el panel es el mismo
  para todo el equipo y los mails solo se ven adentro del panel admin. `apiLookupDni` no devuelve el mail, solo un ticket `l_` de un solo
  uso. La sesion local es un token opaco `s_`; no guardar identidad.
- `apiGetData` y `apiRegister` exigen sesion o ticket si el mail ya tiene
  inscripciones; si no, responden `needsLogin`.
- `apiAdmin*` rechaza JSONP sin `admin=1`. El panel real va por POST a
  `/exec?admin=1`; no usar `?api=` de Pages para administrar.
- Modo ensayo: `modo_prueba=si` marca filas `prueba=true`; el borrado de
  prueba exige `BORRAR PRUEBA` y no toca datos reales.
- Panel de profes: nombre como `Apellido, Nombre`; el mail se abre con un toque
  para leerlo o copiarlo y solo existe en el DOM para admin. `Alumnos` cuenta
  mails unicos y `Reservas` cuenta filas de `Signups`.
- Offline: la copia por charla no guarda mails; la cola de presentes guarda
  solo ID y estado.

## Dominio

- 3 franjas: 10:30-11:20, 11:30-12:20 y 12:30-13:30. Basico 1-3: B1-B10;
  orientado 4-6: O1-O9. Divisiones 1-3: A/B; 4-6: Turismo/Economia. Cupo 40
  por charla; el ciclo se deduce del año. No hay disertante: no inventar
  nombres.
- `ADMIN_PIN` y `GUIDE_PIN` resuelven al mismo rol admin (el equipo usa una sola
  clave); `GUIDE_PIN` no se borra. `checkPins_` del control previo mira solo
  `ADMIN_PIN` y nunca muestra el valor. PIN de 6 digitos; 5 fallos bloquean los intentos
  incorrectos 15 min, pero la clave correcta sigue entrando (una guia no puede
  dejar sin panel a los profes) y los intentos por DNI 2 min. El backend aplica
  permisos.
- Validacion de nombre/apellido: 2-60 caracteres, letras con tildes/ñ, espacios,
  apostrofe y guion; rechazar digitos, HTML, URLs, saltos y prefijos `= + - @`.
- `Sessions` guarda el hash del token, nunca el token crudo; vence a los 7 dias
  o 24 h despues del evento. Se lee y escribe por encabezado, no por columna
  fija. El ingreso con DNI y cada inscripcion cierran las otras sesiones del
  mismo mail; la del que escribe se conserva. `Log` no guarda mails completos.
- Correcciones admin: agregar respeta ciclo/cupo/horario; corregir actualiza
  `Signups`, `Sessions` y `Students`; mover solo dentro del mismo horario;
  fusionar conserva un mail y revoca la sesion descartada; borrar elimina filas
  y sesion.
- Reportes se calculan desde `Signups`, no desde `Students`: alumnos = mails
  unicos; reservas = filas; completos = 3 franjas; faltan charlas = 1 o 2.
  `apiAdminGetData.total` y `apiAdminStatus.total` siguen siendo reservas;
  `studentCount` y `student_count` son alumnos unicos. La guia nunca recibe mails.
- Recordatorios solo opt-in, tandas de 20 con maximo 40, `Mails` deduplica por
  mail + asunto. `MailApp` real sigue sin probarse. El respaldo y las escrituras
  administrativas comparten el lock global. `pruneBackup_` reescribe las copias
  que conserva y recien despues limpia el sobrante: nunca vacia la hoja primero.
- `.ics`: un `VEVENT` por charla, alarma 10 min antes, UID sin datos personales.
- Borrado de datos personales: primero exporta un CSV privado en Drive y aborta
  si no puede; despues limpia `Signups`, `Sessions`, `Mails`, `Students` y
  `Backup`; conserva los encabezados de `Signups` y guarda los contadores
  agregados en `Resumen`. `setup()` repara una `Signups` con encabezado agregado
  viejo. Recomendado a los 30 dias.
- Riesgo residual: el token de alumno viaja por JSONP y los mails nuevos sin
  padron son autodeclarados.

## Tests y trampas

- No hay `package.json` ni `npm install`; los tests son Node puro.
- CI usa Node 20. Evitar APIs nuevas de Node/navegador sin guardas; por ejemplo
  `typeof navigator !== 'undefined'`.
- `esi-tests.js` falla si `index.html` no es copia byte a byte de
  `src/Panel.html`. Sincronizar siempre.
- Los tests extraen el `<script>` inline de `Panel.html` y prueban `demoCall`;
  no separar la UI en scripts externos sin actualizarlos.
- Los tests tambien revisan que `README.md` y `AGENTS.md` mencionen `/exec`,
  `POST` y las hojas compartidas. Un cambio de docs puede romper CI.
- `MailApp` y `ScriptApp` no existen en los tests. Usar guardas
  `typeof ... !== 'undefined'`; el backend ya lo hace para respaldo y cuota.
- El smoke usa un DOM simulado, no un navegador. No reemplaza la prueba real a
  360 px, tacto, teclado, `.ics`, PDF, Wake Lock ni modo oscuro.

## Convenciones

- `index.html` debe ser copia literal de `src/Panel.html`.
- Sin dependencias, frameworks ni build step.
- Textos en voseo rioplatense, frases cortas, sin emojis, sin signos de
  exclamacion ni guiones largos. Movil a 360 px.
- Mantener el texto ESI exacto: `Línea 102: niñez y adolescencia. Línea 144:
  violencia de género. 0800-222-3444: salud sexual, gratuita y confidencial.
  También podés hablar con un docente o preceptor de confianza.` Cada numero
  lleva enlace `tel:`. `TEXTO_DIRECCION` vacio oculta la tarjeta de la direccion.
- No commitear listas, CSV, claves, tokens, keystores ni datos reales de
  alumnos. Los secretos van en Script Properties o GitHub Secrets.
- No hardcodear rutas de la maquina fuera de este archivo; usar constantes.
- No usar `git reset --hard`, `git clean`, `rm -rf` sobre home/root ni `sudo`.
- Commits en espanol, un tema por commit, prefijo `feat:`, `fix:`, `docs:` o
  `test:`.
- No declarar publicado hasta ver el run de CI, Pages verde y el sitio con
  cachebuster.

## Despliegue real

1. Pegar `src/Code.gs` y `src/Panel.html` (archivo `Panel`) en Apps Script.
2. Ejecutar `setup()` y autorizar; crea/actualiza hojas, columnas y trigger.
3. Implementar una nueva version de la aplicacion web.
4. Abrir Pages una vez con `?api=<URL-/exec>` y compartir `/exec?admin=1` con
   profes y guias. Solo se acepta `https://script.google.com/macros/s/<id>/exec`;
   cualquier otro valor se descarta y no se guarda. `?api=` vacio lo borra.
   Deployment activo: `AKfycbwkl-bCNFqUYzjjezaSzpgaC2U0fxe0B1JznKTLODG7VI4ZlVLAb06R1zvZ332kslEVkQ`
   (v47). Los deployments @56 (v43) y @59 (simulacro) se borraron con
   `clasp undeploy`: sus URLs hoy dan 404. El @HEAD solo sirve con login del
   dueno, no lo compartan.
5. Probar en una copia de la planilla: ticket de login, correcciones, modo
   ensayo, respaldo, cierre y borrado. Nunca probar el borrado sobre datos
   reales.
