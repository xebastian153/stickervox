# StickerVox

**Stickers con sonido para WhatsApp desde tus propios videos.** StickerVox es una extensión para Microsoft Edge (y otros navegadores Chromium) que convierte un clip corto en un sticker animado con sonido y lo envía al chat que elijas, todo desde WhatsApp Web.

> **Extensión no oficial.** StickerVox no tiene relación con WhatsApp ni con Meta, ni está respaldada por ellas. Funciona con partes internas de WhatsApp Web que pueden cambiar en cualquier momento; si un día deja de enviar, probablemente WhatsApp se actualizó y hay que esperar una versión nueva.

![El editor de StickerVox: sticker en círculo con borde blanco, texto "¡HOLAAA!" y el indicador "≈ 15 cuadros/s · muy fluido"](store/screenshot-2-editar.png)

## Qué hace

- **Recorta** el tramo exacto del video (hasta 15 segundos) sobre una tira de miniaturas.
- **Encuadre libre:** arrastra y acerca la imagen para elegir qué parte se ve.
- **Texto y emoji** puestos directo sobre el sticker, con estilos (meme, burbuja, etiqueta, sombra), colores y el momento en que aparece cada uno.
- **Forma:** cuadrado, redondeado o círculo, con borde blanco opcional.
- **Indicador de fluidez:** antes de crear el sticker te dice cuántos cuadros por segundo va a tener, o cuántos segundos caben si el tramo no entra en el límite.
- **Audio normalizado** (se puede apagar) con fundidos suaves para que no haga clic.
- **Envío** al chat o grupo que elijas, después de escucharlo.

El sticker sale como WebP animado de 512 × 512 y el sonido como audio Ogg/Opus.

## Instalación

### Desde Microsoft Edge Add-ons (recomendado)

Instálala con un clic desde la tienda: **[StickerVox en Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/PENDIENTE)** <!-- TODO: reemplazar por el enlace real cuando la tienda la apruebe -->

### Desde el ZIP (Edge, Chrome o Brave)

1. Descarga `StickerVox-vX.Y.Z.zip` de la página de **[Releases](https://github.com/xebastian153/stickervox/releases)** y descomprímelo en una carpeta que no vayas a borrar (por ejemplo `Documentos\StickerVox`).
2. Abre `edge://extensions` (en Chrome `chrome://extensions`, en Brave `brave://extensions`).
3. Activa el **Modo de desarrollador**.
4. Pulsa **Cargar desempaquetada** (en Chrome: **Cargar descomprimida**) y elige la carpeta que tiene el archivo `manifest.json`.
5. Fija el ícono de StickerVox en la barra y recarga la pestaña de WhatsApp Web si ya estaba abierta.

Necesitas Edge, Chrome o Brave versión 116 o más nueva en una computadora. No funciona en el celular ni en la app de escritorio de WhatsApp.

## Cómo se usa

1. **Video:** abre [WhatsApp Web](https://web.whatsapp.com), pulsa el ícono de StickerVox y elige un video (MP4, WebM o MOV) o arrástralo al panel.
2. **Editar:** elige el tramo, encuadra, agrega texto o emoji y la forma. Mira el indicador de fluidez y pulsa **Continuar**.
3. **Enviar:** escúchalo, elige el chat o grupo y pulsa **Enviar a …**.

Para la primera prueba, envíatelo a ti: en la lista aparece como **"Tú (mensajes a ti)"**.

## Límites

- **Hasta 15 segundos** por sticker.
- **Hasta 1 MB:** el sticker animado tiene que pesar menos de 1000 KB. Con mucho movimiento, StickerVox baja los cuadros por segundo y la calidad para que quepa; si aun así no cabe, te pide acortar el tramo.
- **Quien lo recibe** necesita una versión de WhatsApp que ya tenga stickers con sonido; si no, verá el sticker animado sin sonido.
- Videos muy largos funcionan, pero crear el sticker tarda un poco más porque se graba el audio del tramo en tiempo real. Quédate en la pestaña mientras se crea.
- La interfaz está en español.

## Privacidad

Todo se procesa en tu navegador. StickerVox no tiene servidores, no usa analítica, no guarda nada y no hace peticiones de red propias: lo único que sale de tu computadora es el sticker que tú decides enviar, y lo envía WhatsApp Web. Detalles en [PRIVACY.md](PRIVACY.md).

## Desarrollo

Es JavaScript sin dependencias ni paso de compilación (Manifest V3).

```bash
npm test          # pruebas de los módulos puros con node --test (Node 22 o más nuevo)
```

Para probarla en el navegador, carga la carpeta del repositorio como extensión desempaquetada (pasos de arriba) y abre WhatsApp Web. La arquitectura está en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Los reportes de errores y las ideas van en [Issues](https://github.com/xebastian153/stickervox/issues).

## Licencia

[MIT](LICENSE) © 2026 Sebas (xebastian153)

---

## English

**StickerVox** is an unofficial Microsoft Edge (and Chromium) extension that turns a short video clip into a WhatsApp sound sticker (animated WebP + Ogg Opus audio) right inside WhatsApp Web: trim up to 15 s, frame freely, add text and emoji layers, pick a square, rounded or circle shape, check the smoothness estimate, listen, and send it to the chat you choose. The interface is in Spanish.

- **Install:** from [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/PENDIENTE) <!-- TODO: real link after approval --> or load the ZIP from [Releases](https://github.com/xebastian153/stickervox/releases) as an unpacked extension (`edge://extensions` → Developer mode → Load unpacked).
- **Limits:** 15 s per sticker, under 1 MB; recipients need a WhatsApp version with sound stickers.
- **Privacy:** everything runs locally in your browser. No servers, no analytics, no storage, no network requests of its own; only the sticker you choose to send leaves your computer, through WhatsApp Web itself. See [PRIVACY.md](PRIVACY.md).
- **Not affiliated** with WhatsApp or Meta. It relies on WhatsApp Web internals that may change at any time.
- **Development:** `npm test`, then load the repository folder as an unpacked extension.
- **License:** [MIT](LICENSE).
