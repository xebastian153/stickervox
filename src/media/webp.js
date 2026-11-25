// StickerVox media: animated WebP muxer (RIFF container, WebP Container Specification).
// Pure byte assembly; only encodeStillWebp touches the browser.
(function (root) {
  const SV = root.StickerVox;
  const media = (SV.media = SV.media || {});

  const VP8X_FLAG_ALPHA = 0x10;
  const VP8X_FLAG_ANIMATION = 0x02;
  const ANMF_FLAG_NO_BLEND = 0x02; // blending bit set = do not blend; dispose bit 0 = no dispose
  const ANMF_FLAG_DISPOSE = 0x01; // dispose to background after the frame is shown

  // Delta frames (S13). A pixel changed when any RGBA channel moved by more than `threshold`; a
  // block changed when at least `minPixels` of its pixels did, so lone codec-noise pixels are
  // ignored. Keyframes every `keyIntervalMs` of shown time bound lossy drift; a sub-rect larger
  // than `maxDeltaShare` of the canvas is sent whole.
  const DELTA_DEFAULTS = { threshold: 12, block: 8, minPixels: 3, margin: 8, keyIntervalMs: 1000, maxDeltaShare: 0.85 };

  function fourcc(bytes, o) {
    return String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  }
  function readU32(bytes, o) {
    return (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0;
  }
  function writeU24(out, o, n) {
    out[o] = n & 255;
    out[o + 1] = (n >>> 8) & 255;
    out[o + 2] = (n >>> 16) & 255;
  }
  function writeU32(out, o, n) {
    writeU24(out, o, n);
    out[o + 3] = (n >>> 24) & 255;
  }
  function writeAscii(out, o, s) {
    for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i);
  }

  // Serializes a chunk (header + payload + pad byte when the payload is odd).
  function makeChunk(id, payload) {
    const out = new Uint8Array(8 + payload.length + (payload.length & 1));
    writeAscii(out, 0, id);
    writeU32(out, 4, payload.length);
    out.set(payload, 8);
    return out;
  }

  function concat(parts) {
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  // Extracts the image-data chunks of one still WebP: [ALPH] + VP8, or VP8L.
  function readStill(bytes, index) {
    const fail = (why) => new Error("Still WebP #" + index + " is invalid: " + why);
    if (!bytes || bytes.length < 20 || fourcc(bytes, 0) !== "RIFF" || fourcc(bytes, 8) !== "WEBP") {
      throw fail("missing RIFF/WEBP header");
    }
    const end = Math.min(bytes.length, 8 + readU32(bytes, 4));
    const chunks = [];
    let hasAlpha = false;
    let o = 12;
    while (o + 8 <= end) {
      const id = fourcc(bytes, o);
      const size = readU32(bytes, o + 4);
      if (o + 8 + size > end) throw fail("truncated chunk " + id);
      const payload = bytes.subarray(o + 8, o + 8 + size);
      if (id === "ALPH") {
        hasAlpha = true;
        chunks.push(makeChunk(id, payload));
      } else if (id === "VP8 ") {
        chunks.push(makeChunk(id, payload));
      } else if (id === "VP8L") {
        // Byte 0 is the 0x2f signature; bit 28 of the next 32 bits is alpha_is_used.
        if (size >= 5 && (readU32(payload, 1) >>> 28) & 1) hasAlpha = true;
        chunks.push(makeChunk(id, payload));
      }
      o += 8 + size + (size & 1);
    }
    const ids = chunks.map((c) => fourcc(c, 0));
    if (!ids.includes("VP8 ") && !ids.includes("VP8L")) throw fail("no VP8/VP8L image data");
    return { data: concat(chunks), hasAlpha };
  }

  // Placement of frame i: full canvas without blending unless options.frames[i] says otherwise.
  // { x, y, width, height, blend = false, dispose = false } — dispose true = dispose to background.
  function frameSpec(spec, i, width, height) {
    const s = spec || {};
    const x = s.x === undefined ? 0 : s.x;
    const y = s.y === undefined ? 0 : s.y;
    const w = s.width === undefined ? width : s.width;
    const h = s.height === undefined ? height : s.height;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x % 2 || y % 2) {
      throw new Error("muxAnimatedWebp: frame #" + i + " offsets must be even integers");
    }
    if (!(Number.isInteger(w) && Number.isInteger(h) && x >= 0 && y >= 0 && w >= 1 && h >= 1 && x + w <= width && y + h <= height)) {
      throw new Error("muxAnimatedWebp: frame #" + i + " lies outside the canvas");
    }
    return { x, y, w, h, flags: (s.blend ? 0 : ANMF_FLAG_NO_BLEND) | (s.dispose ? ANMF_FLAG_DISPOSE : 0) };
  }

  // options.frames (optional, S13): per-frame placement for delta frames; omitted = full frames.
  function muxAnimatedWebp(stills, options) {
    const { width, height, frameDurationsMs, loopCount = 0, frames: specs } = options || {};
    if (!stills || stills.length === 0) throw new Error("muxAnimatedWebp needs at least one frame");
    if (!frameDurationsMs || frameDurationsMs.length !== stills.length) {
      throw new Error("muxAnimatedWebp needs one duration per frame");
    }
    if (!(width >= 1 && height >= 1 && width <= 1 << 24 && height <= 1 << 24)) {
      throw new Error("muxAnimatedWebp: invalid canvas size");
    }

    let anyAlpha = false;
    const frames = stills.map((still, i) => {
      const place = frameSpec(specs && specs[i], i, width, height);
      const frame = readStill(still, i);
      anyAlpha = anyAlpha || frame.hasAlpha;
      const header = new Uint8Array(16);
      writeU24(header, 0, place.x / 2); // X offset / 2
      writeU24(header, 3, place.y / 2); // Y offset / 2
      writeU24(header, 6, place.w - 1);
      writeU24(header, 9, place.h - 1);
      writeU24(header, 12, Math.max(0, Math.min(0xffffff, Math.round(frameDurationsMs[i]))));
      header[15] = place.flags;
      return makeChunk("ANMF", concat([header, frame.data]));
    });

    const vp8x = new Uint8Array(10);
    vp8x[0] = VP8X_FLAG_ANIMATION | (anyAlpha ? VP8X_FLAG_ALPHA : 0);
    writeU24(vp8x, 4, width - 1);
    writeU24(vp8x, 7, height - 1);

    const anim = new Uint8Array(6); // background colour 0 (BGRA), then loop count
    anim[4] = loopCount & 255;
    anim[5] = (loopCount >>> 8) & 255;

    const body = concat([makeChunk("VP8X", vp8x), makeChunk("ANIM", anim), ...frames]);
    const out = new Uint8Array(12 + body.length);
    writeAscii(out, 0, "RIFF");
    writeU32(out, 4, 4 + body.length);
    writeAscii(out, 8, "WEBP");
    out.set(body, 12);
    return out;
  }

  // ---------- delta frames (S13), pure ----------

  // Block-aligned bounding box {x, y, width, height} of what changed between two RGBA frames of
  // the same size, or null when nothing changed beyond the threshold.
  function diffBounds(prev, cur, width, height, options) {
    const { threshold, block, minPixels } = { ...DELTA_DEFAULTS, ...options };
    const cols = Math.ceil(width / block);
    const counts = new Uint16Array(cols);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (let by = 0; by * block < height; by++) {
      counts.fill(0);
      const yEnd = Math.min(height, (by + 1) * block);
      for (let y = by * block; y < yEnd; y++) {
        let o = y * width * 4;
        for (let x = 0; x < width; x++, o += 4) {
          if (
            Math.abs(cur[o] - prev[o]) > threshold ||
            Math.abs(cur[o + 1] - prev[o + 1]) > threshold ||
            Math.abs(cur[o + 2] - prev[o + 2]) > threshold ||
            Math.abs(cur[o + 3] - prev[o + 3]) > threshold
          ) {
            counts[(x / block) | 0]++;
          }
        }
      }
      for (let bx = 0; bx < cols; bx++) {
        if (counts[bx] < minPixels) continue;
        x0 = Math.min(x0, bx);
        x1 = Math.max(x1, bx);
        y0 = Math.min(y0, by);
        y1 = by;
      }
    }
    if (x1 < 0) return null;
    const x = x0 * block;
    const y = y0 * block;
    return { x, y, width: Math.min(width, (x1 + 1) * block) - x, height: Math.min(height, (y1 + 1) * block) - y };
  }

  // Grows a rect by `margin` px (hides seams between old and new lossy pixels), moves its origin
  // down to even offsets (ANMF stores X/2, Y/2) and clamps it to the canvas.
  function expandRect(rect, margin, width, height) {
    const m = Math.max(0, margin || 0);
    const x = Math.max(0, rect.x - m) & ~1;
    const y = Math.max(0, rect.y - m) & ~1;
    const right = Math.min(width, rect.x + rect.width + m);
    const bottom = Math.min(height, rect.y + rect.height + m);
    return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
  }

  // "key" (whole frame, no blending), "delta" (only the sub-rect) or "merge" (nothing new: the
  // previous frame is shown longer). rect: the changed sub-rect, or null when nothing changed.
  function deltaFrameKind({ first, rect, sinceKeyMs, width, height, keyIntervalMs, maxDeltaShare }) {
    if (first) return "key";
    if (!rect) return "merge";
    const interval = keyIntervalMs === undefined ? DELTA_DEFAULTS.keyIntervalMs : keyIntervalMs;
    const share = maxDeltaShare === undefined ? DELTA_DEFAULTS.maxDeltaShare : maxDeltaShare;
    if (sinceKeyMs >= interval) return "key";
    if (rect.width * rect.height > share * width * height) return "key";
    return "delta";
  }

  function opaqueIn(rgba, width, rect) {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let o = (y * width + rect.x) * 4 + 3, end = o + rect.width * 4; o < end; o += 4) if (rgba[o] !== 255) return false;
    }
    return true;
  }

  // Stateful planner: push each rendered RGBA frame (in display order) with its duration and get
  // back { kind, rect, blend }. It compares against the pixels it has already sent (the composited
  // reference), not the previous source frame, so changes below the threshold cannot pile up
  // unseen. Opaque sub-rects blend; a sub-rect touching transparency replaces the canvas pixels
  // under it (blending a transparent pixel would keep the old one and leave a ghost).
  function createDeltaPlanner(options) {
    const o = { ...DELTA_DEFAULTS, ...options };
    const { width, height } = o;
    const full = { x: 0, y: 0, width, height };
    const ref = new Uint8Array(width * height * 4);
    let first = true;
    let now = 0;
    let keyAt = 0;
    return {
      push(rgba, durationMs) {
        const changed = first ? full : diffBounds(ref, rgba, width, height, o);
        const rect = changed && !first ? expandRect(changed, o.margin, width, height) : changed;
        const kind = deltaFrameKind({ first, rect, sinceKeyMs: now - keyAt, width, height, keyIntervalMs: o.keyIntervalMs, maxDeltaShare: o.maxDeltaShare });
        first = false;
        let out;
        if (kind === "key") {
          ref.set(rgba.subarray(0, ref.length));
          keyAt = now;
          out = { kind, rect: full, blend: false };
        } else if (kind === "delta") {
          for (let y = rect.y; y < rect.y + rect.height; y++) {
            const s = (y * width + rect.x) * 4;
            ref.set(rgba.subarray(s, s + rect.width * 4), s);
          }
          out = { kind, rect, blend: opaqueIn(rgba, width, rect) };
        } else out = { kind, rect: null, blend: false };
        now += durationMs;
        return out;
      },
    };
  }

  // Encodes the current canvas content as a still WebP (OffscreenCanvas or HTMLCanvasElement).
  async function encodeStillWebp(canvas, quality) {
    let blob;
    if (typeof canvas.convertToBlob === "function") {
      blob = await canvas.convertToBlob({ type: "image/webp", quality });
    } else {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    }
    if (!blob || blob.type !== "image/webp") {
      throw new Error("Este navegador no puede codificar imágenes WebP.");
    }
    return new Uint8Array(await blob.arrayBuffer());
  }

  media.muxAnimatedWebp = muxAnimatedWebp;
  media.encodeStillWebp = encodeStillWebp;
  media.DELTA_DEFAULTS = DELTA_DEFAULTS;
  media.diffBounds = diffBounds;
  media.expandRect = expandRect;
  media.deltaFrameKind = deltaFrameKind;
  media.createDeltaPlanner = createDeltaPlanner;
})(globalThis);
