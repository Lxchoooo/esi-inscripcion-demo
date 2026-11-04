# ESI Inscripción - Guía para agentes

App de inscripción a la Jornada ESI del Instituto Secundario Salsipuedes.
Backend en Google Apps Script y Google Sheets. El panel se sirve como web app
de Apps Script.

## Estructura

- `src/Code.gs`: backend y API.
- `src/Panel.html`: panel de alumnos, preceptores y administración.
- `index.html`: copia publicada del panel; debe coincidir con `src/Panel.html`.
- `tests/esi-tests.js`: pruebas de backend.
- `tests/ui-smoke.js`: smoke de UI.
- `docs/index.html`: presentación pública de la jornada (GitHub Pages).
- Hojas compartidas: `Signups`, `Talks`, `Students`, `Entrada`, `Mails`,
  `Sessions`, `Log`.

## Deploy

- El panel se publica como web app de Apps Script. La URL de producción termina
  en `/exec`.
- El login se hace por `google.script.run` o POST; no usar `?api=` en enlaces
  para profes.
- Antes de desplegar: `node tests/esi-tests.js src` y
  `node tests/ui-smoke.js src`.
- `scripts/push.sh` sincroniza `src/Panel.html` con `index.html`.

## Privacidad

- No commitear nombres, mails, DNI ni datos de alumnos.
- No commitear tokens, `.env`, keystores ni credenciales. Usar Script
  Properties y GitHub Secrets.
- La presentación de `docs/` usa solo estadísticas agregadas.
