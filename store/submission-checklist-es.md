# Publicar StickerVox en Microsoft Edge Add-ons — lista paso a paso

Todo es gratis: Microsoft no cobra registro ni publicación de extensiones de Edge.

Archivos que vas a usar (todos en esta carpeta `store/`):

| Archivo | Para qué campo |
|---|---|
| `listing-es.md`, `listing-en.md` | Descripción, categoría, términos de búsqueda |
| `permissions-justification.md` | Página **Privacy** (propósito único, permisos, código remoto) |
| `logo-300.png` (300 × 300) | Extension logo |
| `promo-440x280.png` (440 × 280) | Small promotional tile |
| `screenshot-1-video.png` … `screenshot-4-enviar.png` (1280 × 800) | Screenshots |

---

## 0. Antes de enviar

- [ ] **Sube el repositorio público** `xebastian153/stickervox` con `PRIVACY.md` en la rama **`main`**. La URL de la política tiene que abrir antes de enviar: <https://github.com/xebastian153/stickervox/blob/main/PRIVACY.md>. (Hoy el trabajo está en `feat/stickervox-v1`; hay que fusionarlo a `main`.)
- [ ] **Versión (opcional):** si quieres publicar como 1.0.0, cambia `"version": "0.1.0"` → `"1.0.0"` en `manifest.json`, y para que coincida también en `package.json` y en `src/core.js` (`version: "0.1.0"`). Corre `npm test` después.
- [ ] **Nombre y descripción corta:** Partner Center los copia de `manifest.json` y **no se pueden editar en la web**. Si quieres las propuestas de `listing-es.md`, cámbialas en el manifiesto antes de crear el ZIP:
  - `name`: `StickerVox – stickers con sonido para WhatsApp Web (no oficial)` (63 caracteres)
  - `description` (máx. 132): `Convierte un clip de video en un sticker con sonido y envíalo desde WhatsApp Web. Todo local en tu navegador. No oficial.`
  - Si los dejas como están (`StickerVox` y la descripción en inglés), también sirve.
- [ ] **Idiomas de la ficha:** como el manifiesto tiene textos fijos (sin `_locales`), Partner Center mostrará un solo idioma. Agrega el otro con **Add a language** en *Store listings*. Si en algún momento quieres nombre y descripción corta distintos por idioma, hay que pasar el manifiesto a `__MSG_extensionName__` / `__MSG_extensionDescription__` con `default_locale` y carpetas `_locales/es` y `_locales/en`.
- [ ] **Rehaz el ZIP** con `manifest.json` en la raíz del ZIP (no dentro de una carpeta) y solo lo que usa la extensión. En PowerShell, desde la carpeta `stickervox`:

  ```powershell
  Compress-Archive -Path manifest.json, background.js, src, icons, LICENSE -DestinationPath ..\StickerVox-v1.0.0.zip -Force
  ```

- [ ] **Prueba ese ZIP** una vez: descomprímelo en otra carpeta, cárgalo en `edge://extensions` → *Cargar desempaquetada*, crea un sticker y envíatelo a ti.
- [ ] **Publica el mismo ZIP en GitHub Releases** (el README apunta ahí para la instalación manual).

## 1. Crear la cuenta de desarrollador (una sola vez)

1. Ten una **cuenta Microsoft personal** (Outlook.com, Hotmail o Live). También puedes entrar con tu cuenta de GitHub y se crea una cuenta Microsoft por ti. Las cuentas de trabajo o escuela no sirven.
2. Entra a <https://partner.microsoft.com/dashboard/microsoftedge/public/login>. Si no aparece el formulario, ve a *Account settings → Programs* y en la tarjeta **Microsoft Edge** pulsa **Get started**.
3. Llena el formulario **Microsoft Edge Developer Account Registration**:
   - **Account country/region:** donde vives. ⚠️ No se puede cambiar después.
   - **Account type:** **Individual**. ⚠️ No se puede cambiar después. (La verificación es más corta que la de empresa.)
   - **Publisher display name:** el nombre público que verá la gente (máximo 50 caracteres), por ejemplo `xebastian153` o tu nombre. Tiene que estar disponible.
   - **Contact info:** tu correo; Microsoft lo usa para avisos de la cuenta.
   - Lee y acepta el **App Developer Agreement** → **Finish**.
4. Espera el correo de confirmación. El estado se ve en Partner Center → **Open Account Settings**. Mientras tanto puedes seguir con lo de la sección 0.

## 2. Crear la extensión y subir el ZIP

1. Partner Center → tarjeta **Edge** → **Create new extension**.
2. Arrastra `StickerVox-v1.0.0.zip` a **Drag your package here (.zip)**. Si sale un error de validación, corrígelo y vuelve a subirlo.
3. Revisa **Extension overview** y pulsa **Continue**.

## 3. Availability

- **Visibility:** **Public**.
- **Markets:** todos (el valor por defecto). → **Save & Continue**.

## 4. Properties

- **Category:** **Communication** (si no existe, **Photos**). Ver `listing-es.md`.
- **Website:** `https://github.com/xebastian153/stickervox`
- **Support contact detail:** `https://github.com/xebastian153/stickervox/issues`
- **Mature content:** sin marcar (StickerVox no trae contenido para adultos; el contenido lo pone cada usuario con sus propios videos).
- → **Save & Continue**.

## 5. Privacy

Copia los textos de `permissions-justification.md`:

1. **Single Purpose Description** → bloque *Single purpose*.
2. **Permission justification** → un texto por cada permiso que liste Partner Center (acceso a `https://web.whatsapp.com/*`, y si aparecen, scripts de contenido y service worker).
3. **Are you using remote code?** → **No, I am not using remote code**.
4. **Data usage** — *What user data do you plan to collect*: aquí hay que decidir una cosa (verifica los nombres exactos de las casillas en pantalla):
   - **Opción A (recomendada, más transparente):** marca las categorías que describan lo que la extensión **toca** dentro del navegador, normalmente *Website content* (lee los nombres de tus chats en WhatsApp Web) y *Personal communications* (envía un mensaje que tú eliges). Coincide con `PRIVACY.md` y le da al revisor menos motivos para dudar. Contra: la ficha mostrará esas categorías a los usuarios.
   - **Opción B:** no marcar ninguna, porque nada llega al desarrollador ni a terceros. Contra: un revisor podría leerlo como una declaración incompleta.
   - Marca todas las casillas de **I certify that the following disclosures are true** (son ciertas).
5. **Privacy Policy URL:** `https://github.com/xebastian153/stickervox/blob/main/PRIVACY.md`
6. → **Save & Continue**.

## 6. Store listings (por cada idioma)

En la fila de cada idioma, **Edit details**:

| Campo | Qué poner |
|---|---|
| Description | El bloque **Descripción** de `listing-es.md` (español) o **Description** de `listing-en.md` (inglés). Mínimo 250 y máximo 10 000 caracteres; los nuestros tienen unos 2300. |
| Extension logo | `logo-300.png` → después pulsa **Duplicate** para copiarlo a los demás idiomas. |
| Small promotional tile | `promo-440x280.png` (opcional, recomendado) → **Duplicate**. |
| Large promotional tile | Opcional (1400 × 560). No lo preparamos; se puede dejar vacío. |
| Screenshots | `screenshot-1-video.png`, `screenshot-2-editar.png`, `screenshot-3-creando.png`, `screenshot-4-enviar.png`, en ese orden (máximo 6; 1280 × 800). → **Duplicate**. Las leyendas están en español; para la ficha en inglés sirven igual o puedes dejarlas sin duplicar. |
| YouTube video URL | Opcional. Un video corto (sin anuncios) ayuda mucho al revisor, ver sección 7. |
| Search terms | Los 7 términos del archivo del idioma (máximo 7 términos, 30 caracteres cada uno, 21 palabras en total). |

Pulsa **Save draft**. Si aparece *Fields require your attention*, baja hasta los campos con una ✕.

No uses **Generate with AI** para la descripción: la nuestra ya describe solo lo que la extensión hace de verdad.

## 7. Notas para certificación y envío

Cuando todas las filas digan **Complete**, pulsa **Publish**. En **Notes for certification** pega esto (en inglés, para el revisor):

```
StickerVox works only on https://web.whatsapp.com/ and needs a WhatsApp account linked to WhatsApp Web (scan the QR code with a phone). We cannot provide a shared WhatsApp test account because WhatsApp accounts are tied to a personal phone number.

Test steps:
1. Install the extension and open https://web.whatsapp.com/ (sign in with any WhatsApp account).
2. Click the StickerVox toolbar button. A panel opens on the right side of the page.
3. Step 1: click "Elige un video" and pick any short MP4/WebM/MOV file.
4. Step 2: drag the green trim handles (max 15 s), optionally add text ("Texto") or emoji, pick a shape ("Forma"), and click "Continuar".
5. Step 3: the sticker is built locally (progress dots and percentage). Click "Escuchar" to preview it, choose the chat "Tú (mensajes a ti)" (your own chat), and click "Enviar a ...".
6. The sound sticker appears in that chat.

The interface is in Spanish. The extension is unofficial and not affiliated with WhatsApp or Meta. It runs only in the WhatsApp Web tab, makes no network requests of its own (the message is sent by WhatsApp Web itself), loads no remote code, stores no data, and does not change WhatsApp's settings or feature flags. Source code (MIT): https://github.com/xebastian153/stickervox
```

Si subiste un video de demostración a YouTube, agrega su enlace al final de las notas.

Pulsa **Publish**. La certificación puede tardar **hasta 7 días hábiles**. Cuando la aprueben, el estado cambia a **In the Store**.

## 8. Qué esperar de la revisión

Hay riesgo real de rechazo, por estas razones:

| Motivo probable | Cómo responder |
|---|---|
| **No pudieron probarla** (no tienen cuenta de WhatsApp). | Responde con los pasos de la sección 7 y un video corto (YouTube sin listar, sin anuncios) del flujo completo enviándotelo a ti. |
| **Usa la marca "WhatsApp" en el nombre o la ficha** (política 1.1.2 y 2.2: no aparentar representar a otra empresa). | Aclara que es una extensión independiente, que el nombre solo dice *para qué sitio* funciona y que lleva "no oficial". Si insisten, cambia el `name` del manifiesto a `StickerVox – stickers con sonido desde tus videos` y vuelve a subir el ZIP. |
| **Modifica un sitio de terceros / usa sus partes internas.** | Explica que solo agrega un panel propio dentro de WhatsApp Web, que el envío lo hace WhatsApp Web con sus propias funciones, que no cambia ajustes ni funciones experimentales de WhatsApp, que no envía nada automáticamente (cada envío lo confirma el usuario) y que no recopila datos. Remite a `permissions-justification.md`. |
| **Ficha incompleta o engañosa.** | Revisa que nombre, descripción, capturas y página de privacidad digan lo mismo; ajusta y reenvía. |

Para preguntar por el estado o apelar: <https://support.microsoft.com/supportrequestform/e7a381be-9c9a-fafb-ed76-262bc93fd9e4> (formulario *New Support Request*). Responde con hechos, en tono neutro, y con la versión exacta que enviaste.

Ten en cuenta que, aun aprobada, si WhatsApp cambia sus partes internas la extensión puede dejar de enviar; la tienda exige que funcione (política 1.1.3), así que conviene publicar arreglos rápido.

## 9. Después de la aprobación

- [ ] Copia la URL pública de la ficha (Partner Center → **Overview**) y reemplaza `https://microsoftedge.microsoft.com/addons/detail/PENDIENTE` en `README.md` (aparece dos veces).
- [ ] Las actualizaciones se publican subiendo un ZIP nuevo con una `version` mayor en el mismo producto de Partner Center.

---

## Requisitos verificados (Microsoft Learn, consultados el 25-11-2026)

- Publicar una extensión: <https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension>
  - Descripción: mínimo 250, máximo 10 000 caracteres.
  - Logo: 1:1, recomendado 300 × 300, mínimo 128 × 128.
  - Small promotional tile: 440 × 280. Large promotional tile: 1400 × 560 (opcional).
  - Screenshots: hasta 6, de 640 × 480 o 1280 × 800.
  - Search terms: hasta 7 términos, 30 caracteres cada uno, 21 palabras en total.
  - Nombre y descripción corta salen del manifiesto y solo se cambian subiendo un paquete nuevo.
  - Página *Privacy*: propósito único, justificación de permisos, código remoto (no permitido en MV3), uso de datos y URL de la política.
  - Certificación: hasta 7 días hábiles.
- Registrar la cuenta: <https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account>
  - Sin costo; requiere cuenta Microsoft personal (o GitHub); tipo Individual o Empresa; país y tipo no se cambian después; nombre de editor máximo 50 caracteres.
- Políticas para desarrolladores: <https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies>
  - 1.1.1 propósito único; 1.1.2 describir bien la extensión, no mencionar otros navegadores ni aparentar representar a otra empresa; 1.1.4 máximo 7 términos de búsqueda; 1.3 debe poder probarse (dar credenciales o explicar por qué no); 1.5 datos personales y política de privacidad; 1.6 permisos mínimos; 1.7 localización; 2.2 nombres, logos y contenido de terceros.

No verificado (revisa en pantalla): la lista exacta de **categorías** de Partner Center y los nombres exactos de las casillas de **Data usage**; las páginas de Microsoft no los enumeran.
