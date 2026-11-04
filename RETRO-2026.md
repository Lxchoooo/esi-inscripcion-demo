# Jornada ESI 2026: errores, aprendizajes y mejoras

Documento interno (no se publica en GitHub Pages). Sirve para no repetir los
mismos problemas el año que viene y para no olvidar lo que quedó a medias.

**Qué fue**: primera edición de la Jornada ESI con inscripción por horarios.
Evento el **4/11/2026**, 12 cursos, 30 charlas (10 por franja, 3 franjas),
**393 alumnos únicos**, 1.173 reservas, ~357 alumnos presentes.

**Cómo se trabajó**: panel web en Apps Script + Google Sheets, robot de mails
aparte, deploy por clasp/GitHub Actions y un robot de mails en la nube con la
cuenta institucional.

---

## 1. Lo que salió mal

### 1.1 Inscripción y panel

| Problema | Qué pasó | Estado |
|---|---|---|
| Panel lento y "trabado" | El login del panel tardaba 8-10 s (formateaba ~1000 fechas y rearmaba Reporte/Alumnos en cada entrada). Se percibía como que el panel no respondía. | Corregido: login en 0.9 s, cache por trozos, botones con estado "ocupado" y aviso de frescura. |
| Inscripciones cruzadas de ciclo | Alumnos terminaban en una charla del ciclo que no les correspondía, y el cruce no siempre tenía salida (quedaban en un callejón sin salida). | Corregido: swap automático a la misma charla del otro ciclo + aviso por mail. |
| Cupos desbordados | Dos charlas cerraron por encima del cupo (54 y 48 sobre 43) y **16 alumnos quedaron afuera**. La lista de sobrecupo se armó después del evento. | Pendiente de mejora (ver §2). |
| Alumnos duplicados | Mismo alumno con dos mails o dos inscripciones; el panel no siempre lo detectaba. | Hay pestaña de duplicados y fusión, pero conviene prevenirlo. |
| Franjas sin charla | Alumnos con 1 o 2 franjas vacías no aparecían como problema hasta el final. | Corregido: reporte de "faltantes" + recordatorio. |
| Catálogo cambiado en vivo | A días del evento se reescribió la hoja de charlas (30 filas) y hubo alumnos con una charla que desapareció del catálogo. | Se resolvió con "faltantes" + recordatorio, pero fue a destiempo. |
| Mail institucional mal armado | El orden nombre/apellido y el año del mail se sugerían mal en varios casos. | Corregido con reordenamiento y validación en vivo contra el server. |
| Zona horaria | La hora de acceso se corría 3-8 h y los horarios de las charlas se mostraban corridos (8:13 en vez de 10:30). | Corregido (formato y lectura por `getDisplayValues`). |
| Login por DNI en iPhone | El reingreso por DNI fallaba en iPhone cuando se perdía la sesión. | Corregido en rama aparte. |
| Cache viejo | Después de cambiar una inscripción, Reporte/Alumnos seguían mostrando lo anterior. | Corregido con marca de rebuild y cache por charla con TTL. |

### 1.2 El día del evento

- **Asistencia incompleta**: se marcó a mano y quedaron muchos "sin marcar"
  (58 en la segunda franja). El reporte los muestra, pero no se pudieron
  recuperar.
- **Acreditación de entrada separada**: sirvió para saber quién llegó, pero se
  cargó en paralelo a la asistencia de charlas y generó dos listas para
  conciliar.
- **Cambios de último momento**: mover alumnos entre charlas el mismo día
  obliga a avisar por mail en pleno evento; el aviso llegó, pero con el día
  encima.

### 1.3 Mails

| Problema | Qué pasó | Estado |
|---|---|---|
| El trigger de Google no mandaba | La cola `MailQueue` tenía filas "pendiente" con 0 intentos 10 minutos después; el trigger de Google no la ejecutaba. | Se armó un poller propio en Termux (Gmail API). |
| Tokens revocados | El refresh token del dueño murió el 3/11 a las 18:41; el 4/11 estaban revocados los dos del Playground y también el de CI (deploy bloqueado). Tres caídas en dos días. | Se migró al robot en la nube dentro de la cuenta `esi@` (Apps Script + `GmailApp`, sin tokens). El token de CI se regeneró. |
| Mails duplicados | Cada cambio de charla encolaba un mail nuevo; un alumno podía recibir varios por el mismo cambio. | Dedupe por mail + tipo, y se reescribe la fila pendiente. |
| Cuota | `MailApp` tiene tope diario; el envío se cortaba en silencio. | La fila vuelve a `pendiente` sin gastar intento y retoma al minuto. |
| Rebotes | Alumnos del ciclo básico sin casilla (menores de 13: el Workspace no les crea cuenta). | No tiene arreglo automático; se puede poner el mail del tutor a mano. |
| Texto "entrecortado" | El aviso de cierre salió en texto plano con párrafos de una sola línea larga (hasta 615 caracteres) y la app de Gmail lo reacomoda en bloques. | Ya existe la versión HTML (`cierreHtml_`), pero la campaña salió en plano. |
| Mails en el log | El log guardaba el mail del alumno en algunos eventos. | Se dejó de guardar el mail crudo. |
| Probar recién sobre la fecha | `MailApp` recién se probó en vivo el 1/11; el robot nuevo, el 2/11. | Pendiente de proceso: probar en dispositivo con una semana de aire. |

### 1.4 Deploy, credenciales y operación

- **Límite de 200 versiones** de Apps Script: el deploy quedó bloqueado y hubo
  que borrar versiones a mano.
- **URL de deploy**: `clasp deploy` genera una URL nueva; los QR y shortlinks
  apuntaban a la anterior. Hay que redeployar sobre el mismo id.
- **Cuenta `esi@`**: sin compartir la planilla como Editor, el robot no puede
  leer la cola (el error recién se entiende en el diagnóstico).
- **Ejecutar funciones remotas**: la Apps Script API devuelve `NOT_FOUND`
  (`scripts.run`) si no hay un "ejecutable de API"; hoy hay que entrar al
  editor y tocar ▶.
- **Termux/Android**: el proceso muere cuando Android duerme la app (hace falta
  wake lock), y al volver el poller quedaba en 401 por el token vencido.
- **Dos sesiones trabajando en el repo**: se reescribió la historia de `main`
  (limpieza de datos) y un commit de mails quedó afuera; hubo que reaplicarlo.
  Los worktrees ayudaron, pero conviene acordar ramas.
- **Sin staging**: todo se probó contra producción o con un harness casero. Los
  `.gs` del mailer no están cubiertos por los tests del repo.

### 1.5 Datos y privacidad

- La planilla tiene DNI, mails y datos de alumnos: hay que tratarla como dato
  sensible en cualquier export o captura.
- El borrado de datos personales existe, pero no se definió cuándo correrlo
  (fin de año, al archivar, etc.).
- El repo tenía nombres reales en tests y en la documentación; se limpiaron
  antes de dejarlo listo para publicar/privar.

---

## 2. Mejoras para la próxima

### Alta prioridad (evitan el mismo dolor)

1. **Cupo con reserva atómica y lista de espera**: el cupo se revalida en el
   backend, pero dos pedidos simultáneos pueden pasarse. Reserva bajo lock,
   alerta al llegar al 90% y lista de espera con aviso automático.
2. **Catálogo congelado 7 días antes** (o versionado): si cambia un título, se
   conserva el id y se avisa a los anotados; si se elimina una charla, se
   reubica automáticamente a los alumnos.
3. **Una inscripción por franja garantizada** desde la UI y chequeo de
   integridad antes de cerrar la inscripción (0 cruzados, 0 sin charla, 0
   sobrecupo).
4. **Asistencia sin papeles**: QR por charla y marcado desde el celular del
   preceptor (o un botón por curso), para no terminar con "sin marcar".
5. **Mails en HTML** (la variante ya está escrita) y **plantillas
   versionadas**; probar en dispositivo con 7 días de aire.
6. **Rebotes**: si rebota un mail de alumno, enviar al tutor o marcar al alumno
   como "sin casilla" en el panel.
7. **Ejecución remota**: publicar un "ejecutable de API" para poder encolar y
   diagnosticar sin abrir el editor.
8. **Rotación de credenciales documentada** y chequeo mensual de que el robot
   sigue vivo (latido).

### Segunda prioridad (calidad)

9. **Ensayo general** con un curso completo (inscripción + mails + asistencia)
   unos días antes.
10. **Panel de métricas en vivo** para el día (inscriptos por franja, cupo,
    presentes) y reportes automáticos al cierre.
11. **Encuesta de feedback** de 3 preguntas después del evento (se puede
    enlazar en el mail de cierre).
12. **Conciliar entrada y asistencia** en una sola planilla y una sola carga.
13. **Tests de los `.gs` del mailer** (aunque sea el harness casero, versionado).
14. **Limpieza de versiones de Apps Script** programada antes de cada deploy
    grande.
15. **Documentar** en `tools/mailer/README.md` las campañas (encolar, cortar,
    diagnosticar).

### Tercera prioridad (ideas)

16. Recordatorio D-1 automático solo a quienes tienen franjas vacías.
17. Cupos por curso equilibrados (evitar que un curso se quede sin lugar).
18. Historial visible del alumno (cambios, avisos) sin exponer datos sensibles.
19. Formulario de propuestas de charlas para el año siguiente.
20. Modo "sin conexión" más robusto para el día (marcar presentes offline y
    sincronizar después).

---

## 3. Checklist para el año que viene

**D-30**
- [ ] Catálogo de charlas cerrado y aprobado.
- [ ] Cupos definidos por franja y por curso.
- [ ] Planilla nueva con las hojas del sistema y cuenta `esi@` con permiso de
      Editor.
- [ ] Robot de mails verificado (`diagnostico()` + mail de prueba real).

**D-7**
- [ ] Catálogo congelado (solo cambios de lugar o título, con aviso).
- [ ] Ensayo general con un curso.
- [ ] Chequeo de integridad: sin cruces, sin faltantes, sin sobrecupo.
- [ ] Prueba de mails en dispositivo (alumno, preceptor, dirección).

**D-1**
- [ ] Recordatorio a quienes tienen franjas vacías.
- [ ] Listas de asistencia impresas y en el celular.
- [ ] Deploy de la versión final + verificación por curl.
- [ ] Plan de rollback anotado (versión anterior y cómo volver).

**Día del evento**
- [ ] QR/shortlinks probados en el lugar.
- [ ] Asistencia marcada en el momento, no al final.
- [ ] Alguien mirando la cola de mails y el panel.

**D+1 a D+7**
- [ ] Mail de cierre (HTML) con agradecimiento y disculpas.
- [ ] Encuesta de feedback.
- [ ] Reporte final (inscriptos, presentes, ausentes, por charla y por curso).
- [ ] Export de respaldo y decisión sobre borrado de datos personales.

---

## 4. Cómo nos gustaría que se vea

Metas de producto y diseño (no son compromisos: son el norte para el que
retome esto el año que viene).

**Sensación general**
- Que parezca una app, no un formulario: tres pantallas claras (entrar,
  elegir, listo) y una sola acción principal por pantalla.
- Que cargue rápido y no haga esperar: nada de pantallas en blanco ni botones
  que no reaccionan. Si algo tarda, que se vea que está trabajando.
- Que el alumno pueda resolverlo solo, sin explicación previa, en menos de dos
  minutos y desde el celular.
- Tono rioplatense, cercano y claro; textos cortos, sin jerga administrativa.

**Metas medibles**
- LCP < 2,5 s en 4G y p95 de las acciones del server < 300 ms.
- 0 inscripciones cruzadas, 0 sobrecupo, 0 alumnos con franjas vacías al
  cerrar la inscripción.
- > 95% de la asistencia marcada durante el evento (hoy quedó mucha "sin
  marcar").
- Mails encolados y enviados en menos de 5 minutos.
- 0 caídas por credenciales vencidas.

**Detalles de interfaz**
- Mobile-first real: 320 px como piso, botones de 44 px, sin scroll
  horizontal.
- Modo claro y oscuro; contraste AA; foco visible; textos alternativos.
- Errores en línea debajo del campo, con lenguaje humano ("Ese mail no parece
  del colegio", no "invalid_email").
- Estados vacíos que explican qué hacer, y skeletons en lugar de spinners
  eternos.
- Sin animaciones infinitas; las transiciones cortas y con propósito.
- PWA instalable y con la última pantalla cacheada: el día del evento la red
  del colegio no siempre acompaña.
- Listas de asistencia imprimibles y legibles en pantalla (nadie quiere
  imprimir una tabla de 8 columnas).
- Panel de admin ordenado por tareas (inscriptos, asistencia, mails, reportes),
  no por tablas de la planilla.

---

## 5. Referencias para robar ideas

Sitios y productos que resuelven problemas parecidos. La idea no es copiar,
sino mirar cómo lo hacen.

**Elegir una actividad por franja (nuestro caso exacto)**
- **Sched** (<https://sched.com>) y **Whova**: grillas por horario, cupos y
  "elegí una por bloque". Buen ejemplo de cómo mostrar franjas sin marear.
- **Luma** (<https://lu.ma>): página de evento limpísima, una sola llamada a
  la acción, y agregar al calendario con un toque.
- **Eventbrite**: flujo de inscripción y tipos de entrada; sirve para ver cómo
  se manejan cupos y confirmaciones.

**Reservar un turno**
- **Calendly**: selección de horario con disponibilidad en vivo y confirmación
  inmediata.
- **Rallly** (<https://rallly.co>): organización simple de horarios con poca
  fricción.

**Formularios con buena conversión**
- **Tally** y **Typeform**: una pregunta por pantalla, validación al instante,
  progreso visible. (Lo contrario de un Google Form largo.)
- **GOV.UK Design System** (<https://design-system.service.gov.uk>): el mejor
  ejemplo de formularios accesibles, mensajes de error claros y lenguaje
  llano. Muy aplicable a una institución educativa.

**Administración y velocidad percibida**
- **Stripe Checkout**: transmite confianza y reduce pasos.
- **Linear** y **Vercel**: paneles densos pero rápidos, con estados de carga
  bien resueltos.
- **shadcn/ui** y **Radix**: patrones de componentes accesibles para copiar
  comportamiento (no estilo).

**Cupos y entradas**
- **Pretix** (<https://pretix.eu>) y **Hi.events**: open source, con manejo de
  capacidad, listas de espera y check-in por QR. Buen material para la
  asistencia del día.

**Qué NO copiar**
- Formularios de 20 campos (Google Forms) para una inscripción de 2 minutos.
- Tablas de planilla como interfaz principal.
- Modales que tapan el error en lugar de marcarlo en el campo.
- Pop-ups, cookies y avisos que interrumpen.

---

## 6. Cambiar de base: opciones y trade-offs

Hoy: **Apps Script + Google Sheets**, servido como web app, con un robot de
mails aparte. Ventajas reales: cero infraestructura, cuenta institucional,
planilla que cualquiera entiende, permisos de Google. Límites que ya nos
pegaron: latencia variable, cuotas, `LockService` para concurrencia, 6 minutos
por ejecución, deploy por versiones, y cero tipado/entorno de pruebas.

| Opción | A favor | En contra | Cuándo conviene |
|---|---|---|---|
| **Seguir en Apps Script** (pulido) | Nada que mantener, Sheets como panel de respaldo, cero costo, ya funciona | Latencia y cuotas, deploy incómodo, difícil de testear | Si el equipo sigue siendo 1-2 personas y el volumen es < 1.000 alumnos |
| **Cloudflare Pages + Workers + D1/KV** | Muy rápido, gratis o casi, sin cold start, lindo para el front | Hay que escribir el backend, auth y mails a mano; menos gente lo conoce | Si lo más importante es velocidad y costo, y hay quien lo mantenga |
| **Supabase (Postgres + Auth + Edge)** | Base relacional de verdad, auth integrada, realtime, panel SQL | Costo si crece, lock-in moderado, permisos que hay que diseñar bien | Si querés datos serios, reportes y varias apps sobre lo mismo |
| **Vercel/Netlify + Postgres (Neon)** | Front moderno, deploy por PR, ecosistema enorme | Dos servicios, costos, más piezas para que se rompan | Si hay alguien con experiencia en JS/TS full-stack |
| **Firebase** | Auth, DB y hosting en uno, buena integración con Google | Modelo NoSQL incómodo para reportes relacionales, costos por uso | Si ya se usa Google en todo y el equipo es chico |
| **Google Cloud Run + Firestore/SQL** | Escala y sigue en el ecosistema Google | Más infra que mantener, no es "sin servidor" de verdad para un colegio | Si el colegio ya tiene soporte de IT en GCP |

**Recomendación**: si hay que migrar, el camino más barato de mantener es
**Cloudflare Pages (front) + Workers + D1 (datos) + Resend/Postmark (mails)**
o el híbrido **front estático + Supabase**. En los dos casos, mantener una
**exportación a Google Sheets** para preceptores y dirección: es la herramienta
que todos saben usar y no conviene quitarla.

**Qué llevarse sí o sí en una migración**
- Los conceptos del modelo: `Slots` (franjas), `Talks` (charlas con cupo),
  `Signups` (una fila por alumno y por charla), `Entrada`, `Sesiones`,
  `MailQueue`.
- Las reglas de negocio ya probadas: una charla por franja, ciclo correcto,
  cupo, un alumno por mail, mail institucional válido, DNI de 8 dígitos.
- Los tests (388 casos) como red de seguridad: se pueden portar aunque cambie
  la implementación.
- Los QR y shortlinks actuales: si cambia la URL, hay que redirigir desde la
  vieja o reimprimir todo.

**Riesgos de migrar**: perder el histórico de la planilla, romper los links
impresos, subestimar la autenticación con Google del colegio (los alumnos ya
tienen cuenta institucional: conviene usarla) y quedar con dos sistemas
vivos a la vez.

---

## 7. Hoja de ruta (ideas, sin compromiso)

**2027: pulir lo que hay**
- Cerrar los pendientes de §2 (cupo atómico, catálogo congelado, HTML en la
  cola, rebotes, asistencia por QR, ejecutable de API).
- Medir de verdad: latencia, tiempo de inscripción, mails demorados.
- Escribir el "manual de operación" del evento (quién hace qué y cuándo).

**2028: decidir la base**
- Probar un prototipo chico en Cloudflare o Supabase con el mismo modelo de
  datos y los tests portados.
- Comparar con la experiencia real de un curso (no con benchmarks).
- Migrar solo si el prototipo es claramente mejor en velocidad y en
  mantenimiento; si no, quedarse y seguir puliendo.

**Criterios para decidir**
- ¿Cuánto duele hoy? (si el dolor es deploy y mails, se arregla sin migrar).
- ¿Quién lo va a mantener en febrero?
- ¿Cuánto cuesta por año?
- ¿Se puede volver atrás en una tarde?

---

## 8. Lo que le pediría al próximo agente

- Leer esto y `AGENTS.md` antes de tocar nada; el modelo de datos y las reglas
  de negocio no son negociables sin hablarlo.
- No romper los QR ni las URLs ya impresas.
- No mandar mails masivos sin una prueba a una casilla propia y sin mirar la
  cola.
- Probar en un dispositivo real, no solo en el emulador.
- Antes de un deploy grande, verificar la versión anterior y cómo volver.
- Nunca commitear datos de alumnos, tokens ni capturas con datos.
- Si algo se rompe el día del evento: primero el panel (inscripción y
  asistencia), después los mails. Los mails se recuperan; la lista del día no.

---

## 9. Para seguir sumando

Este documento se amplía con lo que vaya apareciendo. Si surge un problema
nuevo, se agrega en la sección que corresponda con: qué pasó, cómo se resolvió
y qué queda pendiente.

Pendientes de definir:
- Qué se hace con los datos de alumnos después del evento (borrar, archivar,
  retención).
- Quién es el dueño de cada credencial (cuenta `esi@`, GitHub, Playground).
- Si la jornada del año que viene repite el formato de 3 franjas o cambia.
