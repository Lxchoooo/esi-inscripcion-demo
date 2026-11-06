# Música de la presentación

## `promo.m4a` y `promo.mp3`

Mezcla de tres canciones provistas por el responsable del proyecto:

- "No Me Olvides", de Abel Pintos.
- "Brindis", de Soledad.
- "Para no verte más", de La Mosca Tsé-Tsé.

La primera suena hasta los 2:52, donde termina el puente y cambia la sección
(no es el medio de un estribillo). Ahí se cruza durante 8 segundos con
"Brindis", que suena completa. Al terminar "Brindis" se cruza durante otros 8
segundos con "Para no verte más", que también suena completa. Cuando termina la
mezcla, vuelve a empezar. Dura 10:29.

- Crossfade equal-power de 8 s entre las tres canciones.
- La primera se empareja en volumen con una rampa suave de -3 dB entre 2:20 y
  2:52; el master queda en -1 dB para evitar clipping.
- La tercera se recorta a 3:09 para no dejar el silencio final de la grabación.

### Formatos

- `promo.m4a`: AAC-LC, 96 kbps, estéreo, 44,1 kHz. Es la versión preferida.
- `promo.mp3`: MP3, 96 kbps, estéreo, 32 kHz. Queda como respaldo para
  navegadores que no puedan reproducir AAC.
- La página elige AAC con `canPlayType` y cae a MP3 si hace falta. La versión
  elegida por el navegador es la que se precarga para escuchar sin conexión.

### Uso

- Suena desde la diapositiva "Palabras para la promo" hasta la última, y se
  puede silenciar o volver a activar con el botón de música.
- Se precarga junto con las fotos en la pantalla de carga, así después funciona
  sin conexión.
- No se versionan los WAV fuente; solo estas dos versiones finales.
