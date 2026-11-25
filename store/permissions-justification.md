# Privacy page answers (Partner Center → Privacy)

Paste these into the **Privacy** page. Partner Center fields are in English; an English answer is safest for reviewers. Every statement below matches `manifest.json` 0.1.0 and the source code.

## Single purpose

```
StickerVox has one purpose: turn a short clip from a video the user picks into a WhatsApp sound sticker (animated WebP plus Ogg Opus audio) and send it to the chat the user chooses, from inside WhatsApp Web. Trimming, framing, text/emoji layers, shapes and the smoothness estimate are all steps of building that one sticker.
```

## Permission justification

The manifest requests no API permissions (`"permissions"` is absent). Partner Center may list the items below; use the matching text.

### Host permission: `https://web.whatsapp.com/*`

```
StickerVox only works inside WhatsApp Web. The host permission lets its content scripts run on https://web.whatsapp.com/ to show the sticker editor panel there and to send the finished sticker through WhatsApp Web itself. It also lets the toolbar button find or open the WhatsApp Web tab and tell it to show the panel. No other site is accessed.
```

### Content scripts in the MAIN world

```
The editor and the sending code run in the page's MAIN world because sending a sound sticker uses WhatsApp Web's own page-side modules (chat list, media upload and message sending), which are not reachable from the isolated world. These scripts are bundled in the package, run only on https://web.whatsapp.com/*, add a single namespace (globalThis.StickerVox) and one panel element inside its own shadow root, never change WhatsApp's feature flags, and make no network requests of their own. A small isolated-world script (src/relay.js) only relays two messages: the toolbar button's "toggle panel" message to the page, and the page's "ready" signal back to the service worker.
```

### Background service worker

```
The service worker (background.js) only handles the toolbar button: if a WhatsApp Web tab is open it focuses it and tells it to toggle the panel; otherwise it opens https://web.whatsapp.com/ and shows the panel when the page is ready. If the WhatsApp tab was opened before the extension was installed, it reloads that tab once so the panel can load. It does not store data, make network requests, or run in the background for any other reason.
```

## Are you using remote code?

Select **No, I am not using remote code**.

```
All JavaScript is included in the package. The extension loads no remote scripts, uses no eval or new Function, and makes no network requests of its own. It is plain, unminified JavaScript with no build step and no third-party libraries.
```

## Data usage

Nothing is collected by the developer: no data leaves the device except the sticker the user sends, and WhatsApp Web sends it. Decide which checkboxes to tick (see `submission-checklist-es.md`, step 6). Tick all certification checkboxes (no selling of data, no use unrelated to the single purpose, no creditworthiness use); they are true.

## Privacy policy URL

```
https://github.com/xebastian153/stickervox/blob/main/PRIVACY.md
```
