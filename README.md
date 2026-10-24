# Jornada ESI - Inscripción a charlas

[![tests](https://github.com/Lxchoooo/esi-inscripcion-demo/actions/workflows/tests.yml/badge.svg)](https://github.com/Lxchoooo/esi-inscripcion-demo/actions/workflows/tests.yml)

Aplicación para que los alumnos del Instituto Secundario Salsipuedes elijan
una charla por franja horaria. Incluye inscripción, control de cupo, panel de
profes y guías, asistencia, reportes e impresión.

- Sitio: https://lxchoooo.github.io/esi-inscripcion-demo/
- Demo: https://lxchoooo.github.io/esi-inscripcion-demo/?demo=1
- Panel demo: https://lxchoooo.github.io/esi-inscripcion-demo/?admin=1&demo=1

El panel real se abre desde `/exec` de Apps Script, no desde GitHub Pages.
GitHub Pages publica solo la demo. La documentación técnica está en
[AGENTS.md](AGENTS.md).

## Alcance

- Inscripción con mail institucional, una charla por horario.
- Panel de profes con cupos, asistencia, reportes y correcciones.
- Acceso para guías sin mails.
- Modo demo sin backend para probar la interfaz.

## Probar

El sitio publicado no necesita instalación. Para usar datos de prueba:

```text
https://lxchoooo.github.io/esi-inscripcion-demo/?demo=1
```

## Instalar el backend

1. Crear una planilla de Google Sheets.
2. Abrir Extensiones > Apps Script.
3. Pegar `src/Code.gs`.
4. Crear un archivo HTML llamado `Panel` y pegar `src/Panel.html`.
5. Ejecutar `setup()` y autorizar los permisos.
6. Implementar como aplicación web, ejecutar como el dueño y permitir acceso
   a cualquiera.
7. Compartir `<URL-/exec>` con alumnos y `<URL-/exec>?admin=1` con profes y
   guías.

Si la planilla ya existía, volver a ejecutar `setup()` para completar hojas,
columnas y configuración.

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

CI corre los tests y verifica que `index.html` sea copia de `src/Panel.html`
en cada push a `main` y en cada pull request.

## Publicar

```bash
scripts/push.sh
```

El script corre los tests y la comparación de `index.html` antes de pushear.
Después se puede revisar el workflow con:

```bash
gh run list --limit 3
```

## Estructura

```text
src/Code.gs        backend de Apps Script
src/Panel.html     interfaz completa
index.html         copia publicada de Panel.html
assets/logo.png    logo oficial
tests/             tests de lógica y smoke
scripts/push.sh    push autenticado a main
AGENTS.md          contexto técnico para agentes
```

## Datos y acceso

- El login de profes y guías viaja por POST con `google.script.run`; no se usa
  `?api=` para administrar.
- `Sessions`, `Signups`, `Mails`, `Log`, `Backup` y `Resumen` se comparten solo
  con profes autorizados.
- No versionar listas, CSV, claves ni tokens.
