# Jornada ESI 2026 — documento del día

Esto es para el 3 y el 4 de noviembre. No tiene claves, ni mails, ni datos de
alumnos: este repo es público.

## Un solo panel para todos

El panel es uno solo. Guías, preceptores y profes entran al mismo panel admin,
con la misma pantalla y las mismas secciones: no hay un panel de guías aparte ni
permisos distintos. Todo el equipo usa la misma clave, `ADMIN_PIN`.

`GUIDE_PIN` queda sin uso: no se borra ni se cambia, y si alguien la tiene
también abre el mismo panel, pero no hace falta repartirla. La clave se comparte
solo por mensaje directo a cada persona del equipo y se cambia después del
evento.

Se entra por `/exec?admin=1`, con la clave y después "Ingresar". El panel le
habla al backend por POST contra ese mismo `/exec`, con la clave o con el token
de la sesión. La sesión dura un par de horas; si se corta, se vuelve a entrar
con la misma clave.

## Cronograma sugerido

### Martes 3 de noviembre (armado, sin alumnos)

| Cuándo | Qué | Dónde |
|---|---|---|
| Primero | Correr `setup()` una vez | Editor de Apps Script |
| Después | Poner la clave nueva en `ADMIN_PIN` | Script Properties (ver abajo) |
| Después | Abrir **Listo para el evento** y revisar que todo esté en verde | Panel, primera sección |
| Antes de imprimir | Cerrar la inscripción para la prueba | Panel → Configuración |
| Cuando esté verde | Imprimir las listas por franja y por curso | Panel → Tomar asistencia / Reportes |
| Si hay tiempo | Correr el simulacro de carga contra una copia (ver abajo) | Termux o una computadora |
| Último paso | Dejar la inscripción **abierta** para el día | Panel → Configuración |

Si algún control queda en amarillo, se puede seguir: son avisos. Los rojos se
arreglan antes de abrir.

### Miércoles 4 de noviembre (día del evento)

| Momento | Qué |
|---|---|
| 30 minutos antes | Abrir el panel, entrar con una clave y mirar **Listo para el evento** |
| Ensayo | Pedirle a una guía que entre con la otra clave y haga de cuenta que busca a un alumno: tiene que ver lo mismo que vos |
| Antes de la primera franja | Confirmar que la inscripción está abierta y que la fecha dice 4/11 |
| Durante cada franja | **Tomar asistencia** → elegir la franja → tocar el alumno cuando llega |
| Entre franjas | **Sin completar**: los que todavía tienen franjas libres |
| Al cerrar cada franja | Mirar el contador de presentes de la charla |
| Al final | **Reportes** para los números y **Descargar CSV** si hace falta una copia |

## Si algo sale mal

### El servidor responde "ocupado"

No se rompió nada: hay demasiada gente anotándose al mismo tiempo. Pedile al
alumno que espere unos segundos y toque de nuevo. Si pasa seguido, mandá a los
cursos de a uno por franja.

### Demasiados "ocupado": escalonar la apertura por curso

El backend atiende una inscripción por vez y devuelve "ocupado" al que llega
mientras otro escribe. Con unos cientos de alumnos a la misma hora eso pasa
seguido, así que la apertura se escalona desde los preceptores:

1. Cada preceptor avisa en su curso el horario que le toca (por ejemplo, 1ro a
   las 9:40, 2do a las 9:50, 3ro a las 10:00).
2. Nadie abre la página antes de su horario: se anota en el aula, no en el
   pasillo.
3. Si un curso termina rápido, el preceptor avisa al siguiente y recién ahí
   siguen.
4. La guía de cada aula no necesita hacer nada: solo mira que el alumno vea la
   confirmación.

Si aun así hay "ocupado", se corta un curso por vez: no se abre otro hasta que
el anterior termine de anotarse.

### No hay internet

El panel y la página del alumno no funcionan sin conexión, pero lo que ya se
guardó queda en el celular del alumno y en la hoja. Para la asistencia, usá la
lista impresa y cargala cuando vuelva la conexión. No borres ni cambies nada en
la hoja a mano mientras no haya conexión.

### Un alumno no figura

1. Buscalo en **Inscripciones** por apellido.
2. Si no está anotado, se anota desde la página del alumno con su mail
   institucional.
3. Si el mail no está en la lista del curso, **Arreglar datos** → agregar al
   alumno a la lista.
4. Si aparece dos veces, **Arreglar datos** → unir duplicados y quedarse con una.

### Una charla se llena

El sistema no deja pasar el cupo: el alumno ve que no hay lugares y elige otra
charla de la misma franja. Si hay que subir el cupo, se cambia en la hoja
`Talks` (columna `cupo`) y se avisa a la guía de esa aula.

### Alguien olvidó la clave

No se puede recuperar: se cambia. Los pasos están abajo. Avisá a la otra persona
que la tenía para que use la nueva.

### Hay que corregir una inscripción

En **Arreglar datos** se puede mover a un alumno de charla, corregir nombre o
apellido, y borrar una inscripción. Después de cualquier cambio, volvé a
**Listo para el evento** y mirá que siga en verde.

### Hay que volver a una versión anterior

Se vuelve con `git revert`, nunca con `git reset` ni con `--force`: eso reescribe el historial y no hay vuelta.

1. `git log --oneline` y ubicá el commit sano.
2. `git revert <commit>` (crea un commit nuevo que deshace el cambio).
3. `git push` de la rama.
4. En Apps Script, `clasp deploy -i <id de deployment> -V <versión anterior>`:
   eso vuelve a servir la versión que funcionaba, sin tocar los datos.
5. Confirmá que `/exec` responde y que el pie dice la versión esperada.

## Probar los recordatorios (una vez, antes del evento)

El envío de mails es lo único que nunca corrió de verdad. Se prueba una sola vez,
con tu propio mail, y no se manda nada a los alumnos hasta verlo funcionar.

El recordatorio le llega a **todos los inscriptos**, hayan tildado algo o no.

1. En **Configuración**, revisá el remitente. Si queda vacío, el mail sale con la
   cuenta del instituto, que suele ser la correcta.
2. Volvé al panel, sección de mails, y tocá **Vista previa**: muestra el texto,
   cuántos inscriptos son y cuánta cuota queda.
3. Escribí **tu mail** en el campo `Tu mail, para probar` y tocá **Mandar prueba**.
   Llega con el asunto prefijado `PRUEBA ·` y no se anota en `Mails`, así que no
   bloquea el envío real. Revisá bandeja y spam.
4. Si la prueba está bien, tocá **Enviar recordatorios**. La tanda es de veinte y
   al final lista los mails que fallaron para reintentar.
5. Revisá que en la hoja `Mails` quede una fila por destinatario y que al tocar
   **Enviar recordatorios** otra vez no se duplique.
6. Mirá **Listo para el evento**: el control de mails tiene que seguir en verde y
   con la cuota descontada.

Ojo con la cuota: una cuenta Gmail común permite unos 100 mails por día, así que
con 500 inscriptos el envío se corta ese día y sigue al siguiente (los enviados
quedan anotados). Con Google Workspace del colegio el tope es 1500 por día.

Si no llega: revisá spam, que el remitente sea una cuenta con permiso para enviar
y que los permisos de envío estén autorizados (los pide la primera ejecución de
`setup()`). Sin cuota no hay reintento: se espera al día siguiente.

La prueba no inscribe a nadie: no hay que borrar nada después.

## Simulacro de carga (antes del evento, sobre una copia)

Sirve para saber cuántos alumnos aguantan el backend y ver los "ocupado" antes
de que los vean los chicos. **Escribe inscripciones de verdad**, así que corre
solo contra una copia de la planilla, nunca contra la real.

1. `Archivo → Hacer una copia` de la planilla. En la copia, `setup()` y un
   deployment propio: ese `/exec` es el que se usa acá.
2. En la copia, prendé `modo_prueba=si` en `Config`. El script se niega a correr
   si no está prendido cuando le pasás la clave.
3. Desde el repo:

```bash
node scripts/loadtest.js <url-exec-de-la-copia> --alumnos 50 --rampa 10,30,50 --copia-ok
```

Sin `--copia-ok` se niega: es la forma de confirmar que es una copia. Si hace
falta revisar cupos y duplicados, la clave va en el entorno, nunca en el
comando:

```bash
ESI_ADMIN_KEY=<clave> node scripts/loadtest.js <url-exec-de-la-copia> --alumnos 50 --rampa 10,30,50 --copia-ok
```

4. Resultado aceptable: las tres tandas sin errores, pocos "busy" en la de 50, y
   el caso de cupo con cuarenta aceptados y el resto "completa". Los tiempos
   p95 se miran entre tandas: si se duplican de 30 a 50, la apertura tiene que
   ir por curso.
5. Al terminar, borrá los datos de prueba desde el panel de la copia. El script
   deja el detalle en `build/loadtest.log` (no se sube al repo).

## Cambiar la clave (Script Properties)

Las claves no están en la hoja ni en el código: viven en **Script Properties**.

1. Abrí el proyecto en <https://script.google.com>.
2. Engranaje → **Propiedades del proyecto** (Script Properties).
3. Editá `ADMIN_PIN`: seis dígitos y distinta de la de siempre. Es la única que
   usa el equipo; `GUIDE_PIN` se deja como está.
4. Guardar. No hace falta republicar: el próximo ingreso ya usa la clave nueva.
5. Entrá al panel con la clave nueva para confirmar que abre.
6. Abrí **Listo para el evento**: el control de la clave tiene que quedar en verde.

Si te equivocás, se puede volver a la anterior con el mismo procedimiento.

## Acciones delicadas

Todo el equipo entra con la misma clave, así que cualquier persona puede tocar
cualquier cosa. Estas acciones **no se hacen el día del evento sin consultar con
el responsable del proyecto**, aunque el panel las permita:

- Cerrar o abrir la inscripción.
- Borrar inscripciones.
- Mover a un alumno de charla o fusionar dos registros.
- Importar la lista del curso.
- Enviar los recordatorios por mail.
- Exportar y cerrar el evento.
- Borrar los datos de prueba.
- Borrar los datos personales.

Si alguien las necesita, se pide por mensaje directo y se espera la respuesta.
La clave se comparte solo por mensaje directo a cada persona del equipo y se
cambia después del evento.

## Qué datos se guardan

| Hoja | Qué tiene | Cuándo se toca |
|---|---|---|
| `Signups` | Una fila por reserva: mail, nombre, curso, franja y charla | Cada inscripción |
| `Sessions` | Tokens de sesión de los alumnos (hash, no la clave) | Al entrar y salir |
| `Mails` | Mail, fecha y asunto de cada recordatorio enviado | Al mandar recordatorios |
| `Log` | Acciones del panel | Cuando alguien borra, corrige o mueve |
| `Backup` | Copia de `Signups` cada media hora, se queda con las últimas veinte | Automático |
| `Resumen` | Totales por charla para los reportes | Cada cambio de inscripción |
| `Errors` | Errores del servidor, sin datos personales | Si algo falla |

Los respaldos a Drive se guardan una vez por día y se conservan los últimos
catorce. Las sesiones vencen solas a los siete días.

Cuando termina la jornada:

1. **Configuración** → cerrar el evento.
2. Exportar lo que se necesite (**Descargar CSV**).
3. Borrar los datos personales desde el panel a los 30 días, o antes si la
   dirección lo pide. Esa acción deja el registro en `Log` y no se puede
   deshacer.
