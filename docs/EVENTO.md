# Jornada ESI 2026 — documento del día

Esto es para el 3 y el 4 de noviembre. No tiene claves, ni mails, ni datos de
alumnos: este repo es público.

## Un solo panel para todos

El panel es uno solo. Guías, preceptores y profes entran al mismo panel admin,
con la misma pantalla y las mismas secciones: no hay un panel de guías aparte ni
permisos distintos. Hay dos claves (una de respaldo de la otra) y cualquiera de
las dos abre exactamente lo mismo. Cambiar una no invalida la otra.

Se entra por `/exec?admin=1`, con la clave y después "Ingresar". El panel le
habla al backend por POST contra ese mismo `/exec`, con la clave o con el token
de la sesión. La sesión dura un par de horas; si se corta, se vuelve a entrar
con la misma clave.

## Cronograma sugerido

### Martes 3 de noviembre (armado, sin alumnos)

| Cuándo | Qué | Dónde |
|---|---|---|
| Primero | Correr `setup()` una vez | Editor de Apps Script |
| Después | Poner las dos claves nuevas | Script Properties (ver abajo) |
| Después | Abrir **Listo para el evento** y revisar que todo esté en verde | Panel, primera sección |
| Antes de imprimir | Cerrar la inscripción para la prueba | Panel → Configuración |
| Cuando esté verde | Imprimir las listas por franja y por curso | Panel → Tomar asistencia / Reportes |
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

## Cambiar las claves (Script Properties)

Las claves no están en la hoja ni en el código: viven en **Script Properties**.

1. Abrí el proyecto en <https://script.google.com>.
2. Engranaje → **Propiedades del proyecto** (Script Properties).
3. Editá `ADMIN_PIN` y `GUIDE_PIN`: seis dígitos cada una, distintas entre sí y
   distintas de la de siempre.
4. Guardar. No hace falta republicar: el próximo ingreso ya usa la clave nueva.
5. Entrá al panel con las dos claves para confirmar que abren.
6. Abrí **Listo para el evento**: el control de claves tiene que quedar en verde.

Si te equivocás, se puede volver a la anterior con el mismo procedimiento.

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
3. Borrar los datos personales desde el panel cuando ya no hagan falta. Esa
   acción deja el registro en `Log` y no se puede deshacer.
