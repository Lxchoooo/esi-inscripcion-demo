# Jornada ESI - Inscripción a charlas

[![tests](https://github.com/Lxchoooo/esi-inscripcion-demo/actions/workflows/tests.yml/badge.svg)](https://github.com/Lxchoooo/esi-inscripcion-demo/actions/workflows/tests.yml)

Página para elegir las charlas de la Jornada ESI y controlar cupos, asistencia
y reportes.

- **Sitio:** https://lxchoooo.github.io/esi-inscripcion-demo/
- **Demo:** https://lxchoooo.github.io/esi-inscripcion-demo/?demo=1
- **Panel demo:** https://lxchoooo.github.io/esi-inscripcion-demo/?admin=1&demo=1
- **Guía técnica:** [AGENTS.md](AGENTS.md)

La demo no necesita instalación: los datos quedan en el navegador. Para
publicar, `scripts/push.sh`.

Detalle técnico: el backend es Apps Script, se abre desde `/exec` y guarda en
Google Sheets. El login de profes usa `google.script.run` (POST), no `?api=`; las
hojas compartidas son `Sessions`, `Signups` y `Mails`.Documentos del evento: [el dia](docs/EVENTO.md), [tarjeta del equipo](docs/EQUIPO.md) ([para imprimir](docs/equipo.html)) y [textos para copiar](docs/COMUNICACION.md).


