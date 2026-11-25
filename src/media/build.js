// StickerVox media: sticker builder. Renders the clip, fits the WebP budget, encodes the audio.
(function (root) {
  const SV = root.StickerVox;
  const media = (SV.media = SV.media || {});

  // Single source of truth for every size/duration limit (UI reads maxClipSec from here).
  // fullDecodeMaxBytes / fullDecodeMaxSec: above either one, the audio is not decoded from the
  // whole file but recorded in real time for the selected segment only (S11, see audio.js).
  const LIMITS = {
    maxClipSec: 15,
    size: 512,
    maxWebpBytes: 1000 * 1024, // WhatsApp Web accepted 1023 KB and rejected 1520 KB (live test, L13)
    maxAudioBytes: 1024 * 1024,
    fullDecodeMaxBytes: 50 * 1024 * 1024,
    fullDecodeMaxSec: 120,
  };
  const CAPTURE_SHARE = 0.95; // share of the audio phase spent recording in real time

  const BASE_FPS = 15;
  // Smoothness first (user choice, L15): at each frame rate, quality drops as far as 0.2 before
  // the frame rate drops; 0.1 is reserved for 8 fps and below. Measured on a 10.8 s real clip:
  // 908 KB at 0.2/10 fps (fits 1000 KB), 868 KB at 0.35/8 fps, 397 KB at 0.1/5 fps.
  const LADDER = [
    { fps: 15, qualities: [0.8, 0.65, 0.5, 0.35, 0.2] },
    { fps: 12, qualities: [0.35, 0.2] },
    { fps: 10, qualities: [0.35, 0.2] },
    { fps: 8, qualities: [0.35, 0.2, 0.1] },
    { fps: 6, qualities: [0.2, 0.1] },
    { fps: 5, qualities: [0.2, 0.1] },
  ];

  // Ordered (quality, fps) attempts, smoothest and best-looking first, smallest last.
  function webpAttempts() {
    return LADDER.flatMap(({ fps, qualities }) => qualities.map((quality) => ({ quality, fps })));
  }

  // Seconds of the same clip that would fit the budget at the smallest setting (≥ 1 s, 0.5 s steps).
  function suggestedClipSec(durationSec, smallestBytes, maxBytes) {
    const fit = (durationSec * maxBytes) / Math.max(1, smallestBytes);
    return Math.max(1, Math.floor(fit * 2) / 2);
  }
  const SEEK_TIMEOUT_MS = 5000;

  function seek(video, time) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        video.removeEventListener("seeked", onSeeked);
        reject(new Error("El video tardó demasiado en avanzar al cuadro pedido."));
      }, SEEK_TIMEOUT_MS);
      const onSeeked = () => {
        clearTimeout(timer);
        resolve();
      };
      video.addEventListener("seeked", onSeeked, { once: true });
      video.currentTime = time;
    });
  }

  function makeCanvas(width, height) {
    const h = height === undefined ? width : height;
    if (typeof root.OffscreenCanvas === "function") return new OffscreenCanvas(width, h);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = h;
    return canvas;
  }

  // ---------- delta frames (S13) ----------

  // Plans the delta frames of one fps step: which kept frames are keyframes, which send only a
  // sub-rect, and which merge into the previous frame (its duration grows). Quality-independent.
  // readPixels(baseIndex) -> RGBA of the rendered frame.
  function planDeltaFrames(plan, readPixels, size) {
    const planner = media.createDeltaPlanner({ width: size, height: size });
    const entries = [];
    plan.indices.forEach((index, j) => {
      const step = planner.push(readPixels(index), plan.durations[j]);
      if (step.kind === "merge") entries[entries.length - 1].durationMs += plan.durations[j];
      else entries.push({ index, kind: step.kind, rect: step.rect, blend: step.blend, durationMs: plan.durations[j] });
    });
    return entries;
  }

  const frameSpecOf = (entry) => ({ x: entry.rect.x, y: entry.rect.y, width: entry.rect.width, height: entry.rect.height, blend: entry.blend, dispose: false });

  // ---------- smoothness estimate (S13 b), pure ----------

  // Cost of one non-key frame relative to a full frame at `fps` (0 = merged, 1 = sent whole),
  // interpolated linearly over the frame interval between measured fps values, clamped outside.
  function deltaShareAt(measured, fps) {
    const points = (measured || []).filter((p) => p && p.fps > 0 && Number.isFinite(p.share)).map((p) => ({ dt: 1 / p.fps, share: p.share }));
    if (!points.length) return 1;
    points.sort((a, b) => a.dt - b.dt);
    const dt = 1 / fps;
    if (dt <= points[0].dt) return points[0].share;
    for (let i = 1; i < points.length; i++) {
      if (dt <= points[i].dt) {
        const a = points[i - 1];
        const b = points[i];
        return a.share + ((dt - a.dt) / (b.dt - a.dt)) * (b.share - a.share);
      }
    }
    return points[points.length - 1].share;
  }

  // Predicted WebP bytes for every ladder step: one keyframe per keyIntervalSec plus delta frames
  // at their measured share of a full frame. fullBytes: { [quality]: bytes of one full frame }.
  // Returns { steps, chosen (first step that fits, or null), smallestBytes, suggestedSec }.
  function predictLadder({ durationSec, maxBytes, attempts, fullBytes, shares, keyIntervalSec = 1, frameOverhead = 8 }) {
    const qualities = Object.keys(fullBytes).map(Number);
    const fullAt = (q) => {
      if (Number.isFinite(fullBytes[q])) return fullBytes[q];
      const nearest = qualities.reduce((best, k) => (Math.abs(k - q) < Math.abs(best - q) ? k : best), qualities[0]);
      return fullBytes[nearest];
    };
    const steps = attempts.map(({ quality, fps }) => {
      const frames = Math.max(1, Math.ceil(durationSec * fps - 1e-6));
      const keys = Math.min(frames, Math.max(1, Math.ceil(durationSec / keyIntervalSec - 1e-6)));
      const full = fullAt(quality);
      const bytes = Math.round(keys * full + (frames - keys) * deltaShareAt(shares, fps) * full + frames * frameOverhead);
      return { quality, fps, bytes };
    });
    const chosen = steps.find((s) => s.bytes <= maxBytes) || null;
    const smallestBytes = Math.min(...steps.map((s) => s.bytes));
    return { steps, chosen, smallestBytes, suggestedSec: chosen ? null : suggestedClipSec(durationSec, smallestBytes, maxBytes) };
  }

  const ESTIMATE_ANCHORS = 4; // frames encoded at every quality + delta pairs after them
  const ESTIMATE_SIZE_SAMPLES = 12; // frames encoded at one quality: frame size varies a lot in real video
  const ESTIMATE_FPS = [15, 10, 5];
  const ESTIMATE_SUB_QUALITY = 0.35;

  function abortError() {
    const error = new Error("Estimate canceled");
    error.name = "AbortError";
    return error;
  }

  // Predicts the ladder step the build will pick, without building, on a separate (sampling)
  // video element: ESTIMATE_SIZE_SAMPLES frames across the range give the mean full-frame size at
  // one quality and are each followed by the frame 1/15 s later to measure what a delta frame
  // costs; ESTIMATE_ANCHORS of them are also encoded at every ladder quality (size ratios) and
  // followed by the frames 1/10 and 1/5 s later.
  // Cancel with signal.aborted; every await yields, so the preview and dragging stay responsive.
  async function estimateSmoothness({ video, start, end, crop, layers, captions, shape, outline, signal }) {
    const size = LIMITS.size;
    const clipStart = Math.max(0, Number(start) || 0);
    const videoDuration = Number.isFinite(video.duration) ? video.duration : Infinity;
    const clipEnd = Math.min(Number(end), clipStart + LIMITS.maxClipSec, videoDuration);
    const durationSec = clipEnd - clipStart;
    if (!(durationSec > 0)) return null;
    const check = () => {
      if (signal && signal.aborted) throw abortError();
    };
    const items = Array.isArray(layers) ? layers : captions;
    const options = drawOptions(shape, outline);
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const attempts = webpAttempts();
    const qualities = [...new Set(attempts.map((a) => a.quality))];
    const ratios = new Map(qualities.map((q) => [q, []]));
    const refSizes = [];
    const shareSamples = new Map(ESTIMATE_FPS.map((fps) => [fps, []]));
    const render = async (tRel) => {
      await seek(video, Math.min(clipStart + tRel, clipEnd - 0.001));
      check();
      media.drawFrame(ctx, video, crop, items, tRel, size, options);
      return ctx.getImageData(0, 0, size, size).data;
    };
    const encode = async (source, quality) => {
      const bytes = (await media.encodeStillWebp(source, quality)).length;
      check();
      return bytes;
    };
    const lastGap = 1 / Math.min(...ESTIMATE_FPS);
    const every = ESTIMATE_SIZE_SAMPLES / ESTIMATE_ANCHORS;
    for (let k = 0; k < ESTIMATE_SIZE_SAMPLES; k++) {
      const tA = Math.max(0, Math.min((durationSec * (k + 0.5)) / ESTIMATE_SIZE_SAMPLES, durationSec - lastGap - 0.002));
      const a = await render(tA);
      const refBytes = Math.max(1, await encode(canvas, ESTIMATE_SUB_QUALITY));
      refSizes.push(refBytes);
      const anchor = k % every === Math.floor(every / 2);
      if (anchor) for (const q of qualities) ratios.get(q).push((q === ESTIMATE_SUB_QUALITY ? refBytes : await encode(canvas, q)) / refBytes);
      // The highest fps (most frames, most merges) is measured after every sample, the others
      // only after the anchors.
      for (const fps of anchor ? ESTIMATE_FPS : ESTIMATE_FPS.slice(0, 1)) {
        if (tA + 1 / fps > durationSec) continue;
        const b = await render(tA + 1 / fps);
        const planner = media.createDeltaPlanner({ width: size, height: size });
        planner.push(a, 1000 / fps);
        const step = planner.push(b, 1000 / fps);
        let share = step.kind === "merge" ? 0 : 1;
        if (step.kind === "delta") {
          const { x, y, width, height } = step.rect;
          const sub = makeCanvas(width, height);
          sub.getContext("2d").drawImage(canvas, x, y, width, height, 0, 0, width, height);
          share = Math.min(1, (await encode(sub, ESTIMATE_SUB_QUALITY)) / refBytes);
        }
        shareSamples.get(fps).push(share);
      }
    }
    const mean = (list) => list.reduce((s, v) => s + v, 0) / Math.max(1, list.length);
    const fullBytes = {};
    for (const [q, list] of ratios) fullBytes[q] = mean(refSizes) * mean(list);
    const shares = [...shareSamples].filter(([, list]) => list.length).map(([fps, list]) => ({ fps, share: mean(list) }));
    return { durationSec, fullBytes, shares, ...predictLadder({ durationSec, maxBytes: LIMITS.maxWebpBytes, attempts, fullBytes, shares }) };
  }

  // Plans which BASE_FPS frames to keep at a given fps, with per-frame durations summing to the clip.
  function planFrames(baseCount, durationSec, fps) {
    const count = Math.max(1, Math.ceil(durationSec * fps - 1e-6));
    const totalMs = Math.max(1, Math.round(durationSec * 1000));
    const indices = [];
    const durations = [];
    let used = 0;
    for (let j = 0; j < count; j++) {
      indices.push(Math.min(baseCount - 1, Math.round((j * BASE_FPS) / fps)));
      const ms = j === count - 1 ? totalMs - used : Math.round(((j + 1) * 1000) / fps) - Math.round((j * 1000) / fps);
      durations.push(Math.max(1, ms));
      used += ms;
    }
    return { indices, durations };
  }

  // Accepts `layers` (S10) or legacy `captions`; unknown shapes fall back to the opaque square.
  function drawOptions(shape, outline) {
    const shapes = media.SHAPES || ["square", "rounded", "circle"];
    return { shape: shapes.includes(shape) ? shape : "square", outline: Boolean(outline) };
  }

  async function buildSticker({ file, video, start, end, crop, captions, layers, shape, outline, normalize = true, onProgress }) {
    const size = LIMITS.size;
    const videoDuration = Number.isFinite(video.duration) ? video.duration : Infinity;
    // Real-time audio capture (long/large files) takes as long as the clip: the UI re-weights its bar.
    const realtime =
      typeof media.audioStrategy === "function" && media.audioStrategy(file && file.size, video.duration, LIMITS) === "capture";
    const progress = (phase, ratio, extra) => {
      if (typeof onProgress !== "function") return;
      onProgress(realtime ? { phase, ratio, realtime: true, ...extra } : { phase, ratio });
    };
    const clipStart = Math.max(0, Number(start) || 0);
    const clipEnd = Math.min(Number(end), clipStart + LIMITS.maxClipSec, videoDuration);
    const durationSec = clipEnd - clipStart;
    if (!(durationSec > 0)) throw new Error("El fragmento elegido está vacío. Revisa el inicio y el fin.");

    // 1. Render every frame once at BASE_FPS; lower fps reuses a subset, so no reseek is needed.
    const items = Array.isArray(layers) ? layers : captions;
    const options = drawOptions(shape, outline);
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext("2d");
    const baseCount = Math.max(1, Math.ceil(durationSec * BASE_FPS - 1e-6));
    const bitmaps = [];
    const wasTime = video.currentTime;
    video.pause();
    try {
      for (let i = 0; i < baseCount; i++) {
        const tRel = i / BASE_FPS;
        await seek(video, Math.min(clipStart + tRel, clipEnd - 0.001));
        media.drawFrame(ctx, video, crop, items, tRel, size, options);
        bitmaps.push(await createImageBitmap(canvas));
        progress("frames", (i + 1) / baseCount);
      }

      // 2. Fit the WebP budget: quality first, then fps. Each fps step stores only what changes
      // between its frames (S13): keyframes are full stills (cached per base frame and quality,
      // encoded exactly as before), delta frames encode just their sub-rect.
      const readCanvas = makeCanvas(size);
      const readCtx = readCanvas.getContext("2d", { willReadFrequently: true });
      const readPixels = (index) => {
        readCtx.clearRect(0, 0, size, size);
        readCtx.drawImage(bitmaps[index], 0, 0);
        return readCtx.getImageData(0, 0, size, size).data;
      };
      const deltaByFps = new Map();
      const fullStills = new Map();
      const fullStill = async (index, quality) => {
        const key = index + "|" + quality;
        if (!fullStills.has(key)) {
          ctx.clearRect(0, 0, size, size);
          ctx.drawImage(bitmaps[index], 0, 0);
          fullStills.set(key, await media.encodeStillWebp(canvas, quality));
        }
        return fullStills.get(key);
      };
      const subStill = async (entry, quality) => {
        const { x, y, width, height } = entry.rect;
        const sub = makeCanvas(width, height);
        const subCtx = sub.getContext("2d");
        subCtx.clearRect(0, 0, width, height);
        subCtx.drawImage(bitmaps[entry.index], x, y, width, height, 0, 0, width, height);
        return media.encodeStillWebp(sub, quality);
      };
      const attempts = webpAttempts();
      let chosen = null;
      let smallestBytes = Infinity;
      for (let a = 0; a < attempts.length && !chosen; a++) {
        const { quality, fps } = attempts[a];
        if (!deltaByFps.has(fps)) deltaByFps.set(fps, planDeltaFrames(planFrames(baseCount, durationSec, fps), readPixels, size));
        const entries = deltaByFps.get(fps);
        const stills = [];
        for (const entry of entries) stills.push(entry.kind === "key" ? await fullStill(entry.index, quality) : await subStill(entry, quality));
        const bytes = media.muxAnimatedWebp(stills, {
          width: size,
          height: size,
          frameDurationsMs: entries.map((e) => e.durationMs),
          frames: entries.map(frameSpecOf),
          loopCount: 0,
        });
        const keys = entries.filter((e) => e.kind === "key").length;
        SV.log("info", "media:webp-attempt", { quality, fps, bytes: bytes.length, frames: entries.length, keys, deltas: entries.length - keys });
        progress("webp", (a + 1) / attempts.length);
        smallestBytes = Math.min(smallestBytes, bytes.length);
        if (bytes.length <= LIMITS.maxWebpBytes) chosen = { bytes, quality, fps };
      }
      if (!chosen) {
        const fitSec = suggestedClipSec(durationSec, smallestBytes, LIMITS.maxWebpBytes);
        throw new Error(
          "Este clip tiene demasiado movimiento para caber en " + Math.round(LIMITS.maxWebpBytes / 1024) +
            " KB. Prueba con un tramo de unos " + String(fitSec).replace(".", ",") + " s.",
        );
      }
      progress("webp", 1);

      // 3. Audio: extract, normalize, encode to Ogg Opus.
      let pcm;
      if (realtime) {
        progress("audio", 0, { recordedSec: 0, totalSec: durationSec });
        pcm = await media.extractAudio(file, clipStart, clipEnd, {
          duration: video.duration,
          onProgress: (ratio) => progress("audio", CAPTURE_SHARE * ratio, { recordedSec: ratio * durationSec, totalSec: durationSec }),
        });
        progress("audio", CAPTURE_SHARE);
      } else {
        progress("audio", 0);
        pcm = await media.extractAudio(file, clipStart, clipEnd, { duration: video.duration });
      }
      const processed = media.normalizePeak(pcm.channels, { sampleRate: pcm.sampleRate, normalize });
      if (!realtime) progress("audio", 0.5);
      const audio = await media.encodeOggOpus({ channels: processed, sampleRate: pcm.sampleRate });
      if (audio.size > LIMITS.maxAudioBytes) {
        throw new Error("El audio supera " + Math.round(LIMITS.maxAudioBytes / 1024) + " KB. Acorta el clip.");
      }
      progress("audio", 1);

      return {
        webp: new Blob([chosen.bytes], { type: "image/webp" }),
        audio,
        durationSec,
        fps: chosen.fps,
        quality: chosen.quality,
        width: size,
        height: size,
      };
    } finally {
      for (const bitmap of bitmaps) bitmap.close();
      try {
        video.currentTime = Number.isFinite(wasTime) ? wasTime : clipStart;
      } catch (e) {
        // Restoring the preview position is best effort.
      }
    }
  }

  media.LIMITS = LIMITS;
  media.buildSticker = buildSticker;
  media.webpAttempts = webpAttempts;
  media.suggestedClipSec = suggestedClipSec;
  media.deltaShareAt = deltaShareAt;
  media.predictLadder = predictLadder;
  media.estimateSmoothness = estimateSmoothness;
})(globalThis);
