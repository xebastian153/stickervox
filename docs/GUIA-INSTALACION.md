# StickerVox — Guía de instalación

StickerVox convierte un video corto en un **sticker con sonido para WhatsApp**: recortas el tramo, ajustas el encuadre, le pones texto o emoji y lo envías al chat que elijas, todo desde WhatsApp Web.

> **Extensión no oficial.** StickerVox no tiene relación con WhatsApp ni con Meta. Funciona usando partes internas de WhatsApp Web que pueden cambiar en cualquier momento; si un día deja de enviar, probablemente WhatsApp se actualizó y hay que esperar una versión nueva. Úsala bajo tu propia responsabilidad.

---

## Qué necesitas

- Una computadora con **Google Chrome, Microsoft Edge o Brave** (versión 116 o más nueva). No funciona en el celular.
- Tu WhatsApp abierto en **https://web.whatsapp.com** (la versión web, no la app de escritorio).
- El archivo **StickerVox-v0.1.1.zip**.

---

## Instalación (5 minutos, una sola vez)

1. **Descomprime el ZIP.**
   Haz clic derecho sobre `StickerVox-v0.1.1.zip` → **Extraer todo…** y elige una carpeta donde se vaya a quedar, por ejemplo `Documentos\StickerVox`.
   ⚠️ **No borres ni muevas esa carpeta después**: el navegador la usa todo el tiempo.

2. **Abre la página de extensiones.** Escribe en la barra de direcciones:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`

3. **Activa el "Modo de desarrollador".** Es un interruptor arriba a la derecha (en Edge está en el menú de la izquierda).

4. **Pulsa "Cargar descomprimida"** (en Edge: "Cargar desempaquetada") y elige la carpeta que descomprimiste: la que tiene adentro el archivo `manifest.json`.

5. **Fija el ícono.** Pulsa el ícono de rompecabezas 🧩 de la barra del navegador y fija **StickerVox** (el cuadrado verde con una bocina).

Si ya tenías WhatsApp Web abierto, **recarga esa pestaña** (tecla F5).

---

## Cómo crear un sticker

1. Abre **WhatsApp Web** y pulsa el ícono verde de **StickerVox**. Se abre un panel a la derecha.
2. **Paso 1 · Video:** pulsa **"Elige un video"** o arrastra el archivo al panel (MP4, WebM o MOV).
3. **Paso 2 · Editar:**
   - Mueve los bordes verdes de la tira de miniaturas para elegir el tramo (hasta **15 segundos**).
   - **Encuadre:** arrastra la imagen para moverla y usa la rueda del ratón para acercar.
   - **Texto / Emoji:** se ponen directo sobre el sticker; arrástralos para moverlos.
   - **Forma:** cuadrado, redondeado o círculo, con borde blanco opcional.
   - Junto a la duración verás qué tan fluido va a quedar (por ejemplo "≈ 15 cuadros/s · muy fluido").
4. Pulsa **Continuar**. El sticker se crea solo (verás puntitos verdes y un porcentaje).
5. **Paso 3 · Enviar:** pulsa **"Escuchar"** para revisarlo, elige el chat y pulsa **"Enviar a …"**.

💡 Para la primera prueba envíatelo a ti mismo: en la lista aparece como **"Tú (mensajes a ti)"**.

---

## Bueno saber

- **Quien lo recibe** necesita una versión de WhatsApp que ya tenga stickers con sonido. Si no la tiene, verá el sticker animado pero sin sonido. El sonido suena al tocar el ícono de la bocina del sticker.
- **Videos con mucho movimiento** se ven menos fluidos: WhatsApp limita el sticker a 1 MB. Si el indicador dice "entrecortado" o "No cabe", acorta el tramo.
- **Videos largos** (por ejemplo, una película): funciona, pero crear el sticker tarda unos segundos más porque graba el audio del tramo. **Quédate en la pestaña de WhatsApp** mientras se crea.
- **Privacidad:** todo se procesa en tu computadora. StickerVox no envía nada a ningún servidor; solo se sube a WhatsApp el sticker que tú envías.

---

## Actualizar a una versión nueva

1. Descarga el ZIP nuevo y descomprímelo **encima de la misma carpeta** (reemplazando los archivos).
2. En `chrome://extensions`, pulsa el botón de recargar ⟳ de StickerVox.
3. Recarga la pestaña de WhatsApp Web.

## Desinstalar

En `chrome://extensions`, pulsa **Quitar** en StickerVox. Después puedes borrar la carpeta.

---

## Problemas frecuentes

| Problema | Solución |
|---|---|
| El ícono no abre nada | Recarga la pestaña de WhatsApp Web (F5). |
| Dice "Esperando a WhatsApp Web…" | Espera a que aparezcan tus chats. Si no pasa, cierra y vuelve a abrir WhatsApp Web. |
| "No cabe · acorta a ~X s" | El tramo tiene mucho movimiento para 1 MB: elige un tramo más corto. |
| "WhatsApp no pudo enviar el sticker" | Revisa tu conexión y vuelve a intentar. Si sigue fallando, probablemente WhatsApp se actualizó: espera una versión nueva de StickerVox. |
| Chrome muestra un aviso sobre extensiones en modo de desarrollador | Es normal en extensiones instaladas fuera de la tienda. Puedes cerrarlo. |
| Tenía otra extensión de stickers con sonido | Desactívala para que no se crucen los paneles. |
