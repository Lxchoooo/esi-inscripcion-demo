# Panel de inscripción a charlas ESI - demo

Demo publica del panel: guarda inscripciones solo en tu navegador
(localStorage) y usa datos de ejemplo. Nada viaja a ningun servidor.

- Version alumno: la URL principal.
- Version profes: agregá `?admin=1` a la URL. Clave demo: `1234`.
- Borra los datos de prueba: limpiá los datos del sitio en el navegador
  (o clic en el candado de la barra de direcciones -> borrar datos).

## Modo real

El mismo `index.html` funciona con un backend de Google Apps Script y
una Google Sheet. El script esta en el repositorio de origen
(carpeta `esi-panel`, archivos `Code.gs` + `Panel.html` + `README.md`
con la guia de instalacion).

Para conectar esta web al backend real, se abre el link asi:

```
https://<usuario>.github.io/<repo>/index.html?api=<URL-del-Apps-Script>
```

La primera vez guarda la URL del backend y de ahi en adelante funciona
contra la Sheet (JSONP contra el Apps Script desplegado).
