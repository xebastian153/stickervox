# StickerVox architecture

Manifest V3 extension. Everything runs inside the WhatsApp Web tab; there is no server and no network call besides WhatsApp Web's own.

## Script worlds

| File | World | Job |
|---|---|---|
| `background.js` | service worker | Toolbar button → tells the WhatsApp tab to toggle the panel (opens WhatsApp Web if no tab exists). |
| `src/relay.js` | isolated content script | Forwards `{type:"stickervox:toggle"}` from the service worker to the page with `window.postMessage`. |
| `src/core.js` | MAIN | Creates the `globalThis.StickerVox` namespace and the logger. Loaded first. |
| `src/media/*.js` | MAIN | Media pipeline (`StickerVox.media`). Pure helpers also run in Node tests. |
| `src/wa/*.js` | MAIN | WhatsApp Web bridge (`StickerVox.wa`). |
| `src/ui/*.js` | MAIN | Panel UI (`StickerVox.ui`). |
| `src/main.js` | MAIN | Boot: mounts the UI and listens for toggle messages. Loaded last. |

MAIN-world scripts are classic scripts (no ES modules). Each file is wrapped in an IIFE that receives `globalThis` and attaches to `globalThis.StickerVox`; nothing else is added to the page's globals.

## Contracts

All times are seconds. Layers and captions use times relative to the clip start.

```js
// Shared types
Crop     = { x, y, size }                  // square region in SOURCE video pixels
Layer    = { id, type, text, x, y, scale, style, color, start, end }
           // type: "text" | "emoji"; x, y: layer center, 0..1 of the output square;
           // scale: font size relative to the output size;
           // style: "meme" | "bubble" | "label" | "shadow"; color: "#rrggbb"
Caption  = { text, start, end, position }  // legacy (v1), position: "bottom" | "top"; still drawn with the v1 layout
DrawOptions = { shape: "square" | "rounded" | "circle", outline: boolean }  // default square, no outline

StickerVox.media = {
  LIMITS: { maxClipSec: 15, size: 512, maxWebpBytes: 1000 * 1024, maxAudioBytes: 1024 * 1024,
            fullDecodeMaxBytes: 50 * 1024 * 1024, fullDecodeMaxSec: 120 },

  loadVideo(file) -> Promise<{ video: HTMLVideoElement, url, duration, width, height }>,
  // Draws one output frame. The UI preview calls this too, so preview == output.
  // items: Layer[] (z-order, last on top) and/or legacy Caption[] (items without `type`).
  // Outside the shape is transparent; square without outline stays opaque, as in v1.
  drawFrame(ctx2d, source, crop, items, tRel, size, options?: DrawOptions) -> void,
  layerBox(ctx2d, layer, size) -> { x, y, w, h },          // normalized box, used by the selection UI
  layoutText(measure, layer, size), shapeGeometry(shape, size, inset), inkFor(color),  // pure
  // options: { duration (video, s), onProgress(ratio 0..1) }. Picks audioStrategy(file.size, duration):
  // "decode" reads + decodes the whole file; "capture" calls captureAudio and records only the segment.
  extractAudio(file, start, end, options?) -> Promise<{ channels: Float32Array[], sampleRate }>,
  audioStrategy(bytes, durationSec, limits) -> "decode" | "capture",                         // pure
  captureAudio(file, start, end, { onProgress }) -> Promise<{ channels, sampleRate }>,      // real time, silent
  timestampChunks(arrivals, sampleRate) -> number[], sliceByTimestamps(chunks, start, end, sampleRate),
  collapseMono(channels),                                                                    // pure
  normalizePeak(channels, { targetDb = -1, fadeMs = 40, sampleRate }) -> Float32Array[],   // pure
  encodeOggOpus({ channels, sampleRate }) -> Promise<Blob>,  // type "audio/ogg; codecs=opus"
  muxOggOpus(packets, { channels, preSkip, inputSampleRate }) -> Uint8Array,               // pure
  // frames (optional, S13): per-frame placement { x, y, width, height, blend = false, dispose = false };
  // x, y even; omitted = full canvas without blending (byte-for-byte the pre-S13 output).
  muxAnimatedWebp(stills, { width, height, frameDurationsMs, loopCount = 0, frames }) -> Uint8Array, // pure
  // Delta frames (S13), pure: DELTA_DEFAULTS { threshold 12, block 8, minPixels 3, margin 8,
  // keyIntervalMs 1000, maxDeltaShare 0.85 }.
  diffBounds(prevRgba, curRgba, width, height, options?) -> { x, y, width, height } | null,  // block-aligned
  expandRect(rect, margin, width, height) -> rect,          // even x/y, clamped
  deltaFrameKind({ first, rect, sinceKeyMs, width, height, keyIntervalMs, maxDeltaShare }) -> "key" | "delta" | "merge",
  createDeltaPlanner({ width, height, ...DELTA_DEFAULTS }) -> { push(rgba, durationMs) -> { kind, rect, blend } },
  // `layers` wins over legacy `captions`; unknown shapes fall back to "square".
  // Shaped stickers keep alpha: VP8X alpha flag + one ALPH chunk per frame.
  // onProgress({ phase: "frames" | "webp" | "audio", ratio }). With real-time capture every event
  // also has realtime: true, and audio events carry recordedSec / totalSec while recording.
  buildSticker({ file, video, start, end, crop, layers, captions, shape, outline, normalize = true, onProgress })
    -> Promise<{ webp: Blob, audio: Blob, durationSec, fps, quality, width, height }>,
  webpAttempts() -> Array<{ quality, fps }>,                 // the ladder, smoothest first
  suggestedClipSec(durationSec, smallestBytes, maxBytes) -> number,
  // Smoothness estimate (S13 b). video must be a separate sampling element, never the preview.
  estimateSmoothness({ video, start, end, crop, layers, shape, outline, signal: { aborted } })
    -> Promise<{ durationSec, fullBytes, shares, steps, chosen: { quality, fps, bytes } | null, smallestBytes, suggestedSec } | null>,
  deltaShareAt(measured: Array<{ fps, share }>, fps) -> number,                              // pure
  predictLadder({ durationSec, maxBytes, attempts, fullBytes, shares, keyIntervalSec = 1, frameOverhead = 8 })
    -> { steps, chosen, smallestBytes, suggestedSec },                                       // pure
};

StickerVox.wa = {
  isReady() -> boolean,
  listChats() -> Array<{ id, name, isGroup, active }>,   // id is a serialized chat id string
  sendSoundSticker({ chatId, webp, audio, durationSec }) -> Promise<{ ok: true } | { ok: false, error }>,
};

StickerVox.ui = { mount() -> void, toggle() -> void };
// Pure panel logic (Node-tested): crop/trim helpers plus layers (createLayer, clampLayer,
// moveLayer, resizeLayer, hitTest, bringToFront, dragTrack, refitLayerTimes, captionToLayer,
// normalizeLayers) and a bounded undo history (createHistory, pushHistory, undoHistory,
// redoHistory; 50 steps, same-key bursts under 1 s collapse into one step), and the long-video
// timeline (filmWindow, windowRatio, windowTime, needsRefocus, placeRange, shiftRange,
// overviewGrab, fmtClock), plus the timeline ruler and build presentation: rulerLayout
// (collision-free labels, pinned start/end), thumbSlots, progressCeiling, smoothProgress
// (monotonic), and the halftone reveal (halftoneSamples, sweepReveal, halftoneDot,
// halftoneFrame, shimmer): dot centers stay on a fixed pitch; only radius/opacity change.
// smoothnessLabel(estimate | null) -> { level, bars, text, spoken } (S13 b).
StickerVox.uiModel = { ... };
StickerVox.log(level, event, data)   // level: "info" | "warn" | "error"; console only, never sent anywhere
```

## Limits

`StickerVox.media.LIMITS` is the single source of truth: the UI reads `maxClipSec` for the trim control, and `buildSticker` lowers fps and WebP quality until the sticker fits `maxWebpBytes`.

## Long videos (S11)

Audio: a file up to `fullDecodeMaxBytes` (50 MB) **and** no longer than `fullDecodeMaxSec` (120 s) is read and decoded whole, which is fast. The byte limit bounds the file copy; the duration limit bounds the decoded PCM (a small but long file, e.g. low-bitrate audio, would still decode into hundreds of MB). Anything else goes through `captureAudio`: a hidden `<audio>` element on a fresh object URL seeks to `start` and plays the segment once at 1×, routed by `createMediaElementSource` into a `ScriptProcessorNode` whose output feeds a zero-gain node (it must reach the destination to run), so nothing is heard. No AudioWorklet module is loaded, since WhatsApp Web's CSP may block it. Each chunk is stamped with the element's media clock; `timestampChunks` smooths the clock per contiguous run and `sliceByTimestamps` cuts exactly `end - start`. Recording takes as long as the clip; it still finishes in a hidden tab, and a timeout (clip + 20 s) guards it. A file without an audio track fails with the same Spanish error as the decode path.

Timeline: videos longer than 60 s show the filmstrip, trim handles and playhead over a window of the selection ± max(2 × its length, 10 s), clamped to the video. When the selection reaches a window edge (after a drag ends, or right away for keys and the overview), the window recenters; old thumbnails are shifted to their new place and new ones load 250 ms later, cancelable, nearest to the selection first. A slim overview bar above the filmstrip shows the whole video, the zoomed window and the selection; clicking or dragging moves the selection (length kept), arrows move it 1 s and Page Up/Down 10 s.

## Delta frames (S13)

The ladder (`webpAttempts`, smoothest first) is unchanged; each step just costs fewer bytes. Frames are still rendered once at 15 fps. For each fps step, `createDeltaPlanner` walks the kept frames in order and compares each one with the pixels already sent (the composited reference, so changes below the threshold cannot pile up unseen):

- nothing changed beyond the threshold (any RGBA channel > 12 in ≥ 3 pixels of an 8×8 block) → **merge**: the previous frame's duration grows;
- otherwise the changed blocks' bounding box, grown by 8 px and moved to even offsets, is encoded alone (cropped to its own canvas, same canvas WebP encoder) as an ANMF sub-frame with dispose none → **delta**;
- the first frame, every frame 1 s (shown time) after the last keyframe, and any frame whose sub-rect covers more than 85 % of the canvas → **key**: full frame, no blending, encoded exactly as before (cached per base frame and quality).

Transparency: a delta sub-rect that is fully opaque uses alpha blending; one that touches a non-opaque pixel (the edge of a circle/rounded sticker) uses no-blend, so its pixels, transparent ones included, replace what was there. Layers appearing or disappearing change whole blocks and are always sent. The VP8X canvas stays 512×512.

## Smoothness estimate (S13)

Step 2 shows the clip length and, next to it, the predicted result ("≈ 10 cuadros/s · fluido", or "No cabe · acorta a ~X s"). Every edit (`markEdited`) cancels the running estimate and restarts a 400 ms timer; it only runs in step 2 while not building. `estimateSmoothness` seeks a second, muted video element on its own object URL (the preview and the real-time audio path are untouched), renders 12 frames across the range with `drawFrame` and the current crop/layers/shape, encodes them at one quality for the mean frame size, encodes 4 of them at every ladder quality for the size ratios, and measures what the delta frame 1/15 s later (every sample) and 1/10, 1/5 s later (the 4 anchors) costs. `predictLadder` turns that into bytes per ladder step (one keyframe per second plus delta frames) and the first step that fits wins. The visible chip is `aria-hidden`; a polite status line reads only finished results that differ from the last one. Level is shown by a word plus a 4-bar meter (never color alone).
