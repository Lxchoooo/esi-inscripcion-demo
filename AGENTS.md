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
- Estado: v51 en `main` (panel `v51`, backend `v51`; deployment activo `AKfycbwkl...` republicado a @70). Ronda 19: la ficha del alumno (tap en el nombre) muestra nombre completo, año y división, DNI (desde la lista, si esta), charlas elegidas con horario, titulo y presente, y mail copiable; el alta manual de la lista ahora tiene tres selects de charlas (una por franja, solo activas del ciclo del año elegido y con cupos restantes): agrega a la lista y encadena apiAdminAddStudent (cupo, ciclo y franja los revalida el backend; si falla queda en la lista + mensaje). El tab "Sin completar" paso a "Faltan charlas" y explica que lista a quien no eligio las tres franjas, para irlos a buscar antes del evento. Barras de los reportes con paleta rotante (tint 1/2/3) y rojo cuando la charla llega al 90% del cupo. De la ronda 18 (v50): borrado rapido (rebuild de Reporte y Alumnos diferido a la corrida del trigger via marca `rebuild_derived_pending`), banner de estado del borrado, update local de lista y cupos, y "Borrar alumno" con lista de inscriptos y eleccion separada charla/alumno.
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
