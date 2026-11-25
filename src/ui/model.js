// StickerVox panel model (MAIN world): pure crop, range and caption helpers used by the panel.
// No DOM access here, so every function also runs in Node tests.
(function (root) {
  const SV = root.StickerVox;
  if (!SV) return;

  const MIN_CROP_RATIO = 0.15;
  const DEFAULT_CUE_SEC = 1;

  const isNum = (value) => typeof value === "number" && Number.isFinite(value);
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function defaultCrop(videoW, videoH) {
    const size = Math.min(videoW, videoH);
    return { x: (videoW - size) / 2, y: (videoH - size) / 2, size };
  }

  function sizeLimits(videoW, videoH) {
    const short = Math.min(videoW, videoH);
    return { min: short * MIN_CROP_RATIO, max: short };
  }

  // Keeps the square inside the frame and its size between 15% and 100% of the short side.
  function clampCrop(crop, videoW, videoH) {
    if (!crop || !isNum(crop.x) || !isNum(crop.y) || !isNum(crop.size)) return defaultCrop(videoW, videoH);
    const limits = sizeLimits(videoW, videoH);
    const size = clamp(crop.size, limits.min, limits.max);
    return {
      x: clamp(crop.x, 0, videoW - size),
      y: clamp(crop.y, 0, videoH - size),
      size,
    };
  }

  // factor > 1 zooms in (smaller region). The anchor (source pixels) stays at the same
  // relative spot of the crop unless the frame edge forces a shift.
  function zoomCrop(crop, factor, anchorX, anchorY, videoW, videoH) {
    const current = clampCrop(crop, videoW, videoH);
    if (!isNum(factor) || factor <= 0) return current;
    const ax = isNum(anchorX) ? anchorX : current.x + current.size / 2;
    const ay = isNum(anchorY) ? anchorY : current.y + current.size / 2;
    const u = (ax - current.x) / current.size;
    const v = (ay - current.y) / current.size;
    const limits = sizeLimits(videoW, videoH);
    const size = clamp(current.size / factor, limits.min, limits.max);
    return clampCrop({ x: ax - u * size, y: ay - v * size, size }, videoW, videoH);
  }

  function panCrop(crop, dx, dy, videoW, videoH) {
    const current = clampCrop(crop, videoW, videoH);
    return clampCrop(
      { x: current.x + (isNum(dx) ? dx : 0), y: current.y + (isNum(dy) ? dy : 0), size: current.size },
      videoW,
      videoH,
    );
  }

  // Returns a non-empty range inside [0, duration] no longer than maxClipSec.
  function clampRange(start, end, duration, maxClipSec) {
    const total = isNum(duration) && duration > 0 ? duration : 0;
    const maxLen = isNum(maxClipSec) && maxClipSec > 0 ? maxClipSec : total;
    let s = clamp(isNum(start) ? start : 0, 0, total);
    let e = isNum(end) ? clamp(end, 0, total) : Math.min(total, s + maxLen);
    if (e <= s) e = Math.min(total, s + maxLen);
    if (e <= s) s = Math.max(0, total - maxLen);
    if (e - s > maxLen) e = s + maxLen;
    return { start: s, end: e };
  }

  // Cleans caption cues for drawing/encoding: trimmed text, times inside the clip, start < end.
  function normalizeCues(cues, clipDuration) {
    if (!Array.isArray(cues)) return [];
    const total = isNum(clipDuration) && clipDuration > 0 ? clipDuration : 0;
    const out = [];
    for (const cue of cues) {
      if (!cue) continue;
      const text = String(cue.text ?? "").trim();
      if (!text) continue;
      let start = clamp(isNum(cue.start) ? cue.start : 0, 0, total);
      let end = clamp(isNum(cue.end) ? cue.end : total, 0, total);
      if (end < start) [start, end] = [end, start];
      if (end === start) end = Math.min(total, start + DEFAULT_CUE_SEC);
      if (end === start) start = Math.max(0, end - DEFAULT_CUE_SEC);
      if (end <= start) continue;
      out.push({ text, start, end, position: cue.position === "top" ? "top" : "bottom" });
    }
    return out.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  // ---------- wizard helpers ----------

  const STEP_SEC = 0.1; // trim and caption times snap to 0.1 s
  const NEW_CUE_SEC = 1.5;
  const snap = (value) => Math.round(value / STEP_SEC) * STEP_SEC;
  const clean = (value) => Math.round(value * 1e6) / 1e6;

  // Drags one trim handle. Handles never cross: the other one is pushed (min length 0.1 s)
  // or pulled along (max length maxClipSec), so dragging also slides the window.
  function moveTrimHandle(range, handle, value, duration, maxClipSec) {
    const total = isNum(duration) && duration > 0 ? duration : 0;
    const maxLen = isNum(maxClipSec) && maxClipSec > 0 ? Math.min(maxClipSec, total) : total;
    const minLen = Math.min(STEP_SEC, total);
    let { start, end } = clampRange(range && range.start, range && range.end, total, maxLen);
    if (handle === "start") {
      start = clamp(isNum(value) ? snap(value) : start, 0, Math.max(0, total - minLen));
      if (end - start < minLen) end = start + minLen;
      if (end - start > maxLen) end = start + maxLen;
    } else {
      end = clamp(isNum(value) ? snap(value) : end, minLen, total);
      if (end - start < minLen) start = end - minLen;
      if (end - start > maxLen) start = end - maxLen;
    }
    return { start: clean(start), end: clean(end) };
  }

  function timeToRatio(time, duration) {
    if (!isNum(time) || !isNum(duration) || duration <= 0) return 0;
    return clamp(time / duration, 0, 1);
  }

  // ---------- long videos (S11): filmstrip zoom window + whole-video overview ----------
  // Window = { start, end }: the slice of the video the filmstrip, trim handles and playhead show.
  const ZOOM_MIN_DURATION = 60; // videos up to this long show the whole video, as before
  const ZOOM_PAD_MIN = 10; // seconds shown at least on each side of the selection
  const ZOOM_EDGE_SEC = 2; // a selection this close to a window edge asks for a new window

  function filmWindow(range, duration) {
    const total = isNum(duration) && duration > 0 ? duration : 0;
    if (total <= ZOOM_MIN_DURATION) return { start: 0, end: total };
    const start = range && isNum(range.start) ? range.start : 0;
    const end = range && isNum(range.end) ? range.end : start;
    const len = Math.max(0, end - start);
    const pad = Math.max(2 * len, ZOOM_PAD_MIN);
    const width = Math.min(total, len + 2 * pad);
    const s = clamp((start + end) / 2 - width / 2, 0, total - width);
    return { start: clean(s), end: clean(s + width) };
  }

  function windowRatio(time, win) {
    const width = win ? win.end - win.start : 0;
    if (!isNum(time) || !(width > 0)) return 0;
    return clamp((time - win.start) / width, 0, 1);
  }

  function windowTime(ratio, win) {
    if (!win) return 0;
    return win.start + clamp(isNum(ratio) ? ratio : 0, 0, 1) * Math.max(0, win.end - win.start);
  }

  // True when the selection left the window or reached one of its inner edges (an edge that is
  // also the video's own edge does not count).
  function needsRefocus(win, range, duration) {
    if (!win || !range) return true;
    const width = win.end - win.start;
    const margin = Math.min(ZOOM_EDGE_SEC, width * 0.05);
    const total = isNum(duration) ? duration : win.end;
    const left = win.start > 0 ? win.start + margin : 0;
    const right = win.end < total ? win.end - margin : total;
    return range.start < left || range.end > right;
  }

  // Moves the selection to `start` keeping its length, snapped to 0.1 s and inside the video.
  function placeRange(range, start, duration) {
    const total = isNum(duration) && duration > 0 ? duration : 0;
    const len = Math.min(Math.max(0, range.end - range.start), total);
    const s = clamp(snap(isNum(start) ? start : range.start), 0, Math.max(0, total - len));
    return { start: clean(s), end: clean(s + len) };
  }

  const shiftRange = (range, delta, duration) => placeRange(range, range.start + (isNum(delta) ? delta : 0), duration);

  // Overview drag: grabbing the selection keeps the grab point; elsewhere it centers on the pointer.
  function overviewGrab(range, time) {
    const len = Math.max(0, range.end - range.start);
    return isNum(time) && time >= range.start && time <= range.end ? time - range.start : len / 2;
  }

  // 600 -> "10:00", 3725 -> "1:02:05".
  function fmtClock(sec) {
    const t = Math.max(0, Math.floor(isNum(sec) ? sec : 0));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const ss = String(t % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  }

  // ---------- filmstrip ruler (S12) ----------
  // Time labels live on their own row above the thumbnails. Labels are never truncated: one that
  // would overflow an edge is pushed inward, and one that would touch another label or a handle
  // zone ({ from, to } in px) is dropped instead. Pins ({ x, text }, at most two, e.g. the
  // selection's start and end above their handles) always show: they are placed first, spread
  // apart when they would overlap, and the regular labels make room for them.
  const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  // Minor ticks per step: the first division that keeps ticks at least RULER_MINOR_PX apart.
  const RULER_DIVS = { 1: [5, 2], 2: [4, 2], 5: [5], 10: [5, 2], 15: [3], 30: [6, 3, 2], 60: [6, 4, 2], 120: [4, 2], 300: [5], 600: [5, 2], 900: [3], 1800: [6, 3], 3600: [4, 2] };
  const RULER_MINOR_PX = 6;

  function rulerLayout(opts) {
    const o = opts || {};
    const gap = isNum(o.gap) ? o.gap : 6;
    const empty = { ticks: [], labels: [], step: 0, gap };
    const win = o.win;
    const width = isNum(o.width) ? o.width : 0;
    const span = win && isNum(win.start) && isNum(win.end) ? win.end - win.start : 0;
    if (!(span > 0) || !(width > 0)) return empty;
    const charPx = isNum(o.charPx) && o.charPx > 0 ? o.charPx : 6.5;
    const avoid = Array.isArray(o.avoid) ? o.avoid.filter((z) => z && isNum(z.from) && isNum(z.to)) : [];
    const pps = width / span;
    const textW = (text) => text.length * charPx;
    const format = typeof o.format === "function" ? o.format : fmtClock;
    const need = 1.6 * textW(String(format(win.end))) + 2 * gap; // airy: about one label per 2 widths
    const step = RULER_STEPS.find((s) => s * pps >= need) || RULER_STEPS[RULER_STEPS.length - 1];
    const div = (RULER_DIVS[step] || []).find((d) => (step / d) * pps >= RULER_MINOR_PX) || 1;
    const minor = step / div;
    const eps = 1e-6;
    const ticks = [];
    const pins = placePins(o.pins, width, textW, gap);
    const labels = [];
    let right = -Infinity;
    for (let k = Math.ceil((win.start - eps) / minor); k * minor <= win.end + eps; k++) {
      const t = clean(k * minor);
      const x = clamp((t - win.start) * pps, 0, width);
      const major = k % div === 0;
      ticks.push({ t, x, major });
      if (!major) continue;
      const text = String(format(t));
      const w = textW(text);
      if (w > width) continue;
      const left = clamp(x - w / 2, 0, width - w);
      if (left < right + gap) continue;
      const hits = (z) => left - gap < z.to && left + w + gap > z.from;
      if (avoid.some(hits) || pins.some((p) => hits({ from: p.left, to: p.left + p.width }))) continue;
      labels.push({ t, x, left, width: w, text });
      right = left + w;
    }
    return { ticks, labels: [...labels, ...pins].sort((a, b) => a.left - b.left), step, gap };
  }

  function placePins(list, width, textW, gap) {
    const pins = (Array.isArray(list) ? list : [])
      .filter((p) => p && isNum(p.x) && p.text)
      .slice(0, 2)
      .map((p) => ({ x: p.x, text: String(p.text), width: textW(String(p.text)), pin: true }))
      .filter((p) => p.width <= width)
      .sort((a, b) => a.x - b.x);
    for (const p of pins) p.left = clamp(p.x - p.width / 2, 0, width - p.width);
    if (pins.length === 2 && pins[1].left < pins[0].left + pins[0].width + gap) {
      const total = pins[0].width + gap + pins[1].width;
      if (total > width) return [pins[0]];
      pins[0].left = clamp((pins[0].x + pins[1].x) / 2 - total / 2, 0, width - total);
      pins[1].left = pins[0].left + pins[0].width + gap;
    }
    return pins;
  }

  // Thumbnails per filmstrip close to the video's own aspect ratio, so the frame content (a
  // burned-in clock, a face) is barely cropped. Rounding down makes slots wider: they lose a
  // little top and bottom rather than the sides.
  function thumbSlots(trackW, trackH, videoW, videoH) {
    if (![trackW, trackH, videoW, videoH].every((v) => isNum(v) && v > 0)) return 8;
    return clamp(Math.floor(trackW / (trackH * (videoW / videoH)) + 1e-9), 3, 16);
  }

  // A new caption starts at the playhead and lasts 1.5 s, clamped to the clip.
  function cueAtPlayhead(playhead, clipLen) {
    const len = isNum(clipLen) && clipLen > 0 ? clipLen : 0;
    const start = clamp(snap(isNum(playhead) ? playhead : 0), 0, Math.max(0, len - STEP_SEC));
    return { start: clean(start), end: clean(Math.min(len, snap(start + NEW_CUE_SEC))) };
  }

  // "Empieza aquí" / "Termina aquí": moves one edge to t and repairs the other if they cross.
  function setCueEdge(cue, edge, t, clipLen) {
    const len = isNum(clipLen) && clipLen > 0 ? clipLen : 0;
    let start = clamp(cue && isNum(cue.start) ? cue.start : 0, 0, len);
    let end = clamp(cue && isNum(cue.end) ? cue.end : len, 0, len);
    const v = clamp(snap(isNum(t) ? t : 0), 0, len);
    if (edge === "start") {
      start = Math.min(v, Math.max(0, len - STEP_SEC));
      if (end - start < STEP_SEC) end = Math.min(len, start + NEW_CUE_SEC);
    } else {
      end = Math.max(v, Math.min(STEP_SEC, len));
      if (end - start < STEP_SEC) start = Math.max(0, end - NEW_CUE_SEC);
    }
    return { start: clean(start), end: clean(end) };
  }

  // Avatar initials: first letter of the first two words that contain letters. "" when none.
  function initials(name) {
    const words = String(name ?? "")
      .split(/\s+/)
      .map((word) => (word.match(/\p{L}/u) || [""])[0])
      .filter(Boolean);
    return words.slice(0, 2).join("").toLocaleUpperCase();
  }

  // Stable hue (0..359) from a name: FNV-1a over code points.
  function avatarHue(name) {
    let hash = 0x811c9dc5;
    for (const char of String(name ?? "")) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash % 360;
  }

  const fold = (text) =>
    String(text ?? "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase()
      .trim();

  // Chat list for the picker: filtered by name (accent and case insensitive), self chat first.
  function orderChats(chats, query) {
    if (!Array.isArray(chats)) return [];
    const q = fold(query);
    const matches = chats.filter((chat) => chat && (!q || fold(chat.name).includes(q)));
    return [...matches.filter((chat) => chat.isSelf), ...matches.filter((chat) => !chat.isSelf)];
  }

  function pickChatId(chats, currentId) {
    if (!Array.isArray(chats) || !chats.length) return null;
    if (currentId && chats.some((chat) => chat && chat.id === currentId)) return currentId;
    const preferred = chats.find((chat) => chat && chat.active) || chats.find((chat) => chat && chat.isSelf);
    return preferred ? preferred.id : null;
  }

  // buildSticker reports { phase, ratio }; phases share one overall bar.
  const PHASES = {
    frames: { label: "Preparando cuadros…", from: 0, to: 0.6 },
    webp: { label: "Comprimiendo…", from: 0.6, to: 0.85 },
    audio: { label: "Preparando audio…", from: 0.85, to: 1 },
  };
  // With real-time audio capture (long videos) the audio takes as long as the clip.
  const REALTIME_PHASES = {
    frames: { ...PHASES.frames, from: 0, to: 0.35 },
    webp: { ...PHASES.webp, from: 0.35, to: 0.45 },
    audio: { ...PHASES.audio, from: 0.45, to: 1 },
  };
  const fmtCount = (sec) => {
    const v = Math.round(sec * 10) / 10;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  function buildProgress(event) {
    const phase = event && (event.realtime ? REALTIME_PHASES : PHASES)[event.phase];
    if (!phase) return { label: "Creando sticker…", ratio: null };
    const ratio = isNum(event.ratio) ? clamp(event.ratio, 0, 1) : 0;
    let label = phase.label;
    if (event.phase === "audio" && isNum(event.recordedSec) && isNum(event.totalSec)) {
      const done = Math.floor(clamp(event.recordedSec, 0, event.totalSec) + 1e-6);
      label = `Grabando el audio del fragmento… ${done} / ${fmtCount(event.totalSec)} s`;
    }
    return { label, ratio: clean(phase.from + (phase.to - phase.from) * ratio) };
  }

  // Where the current phase ends on the overall bar: progress may creep toward it while a phase
  // reports nothing (audio decode, WebP attempts), never past it.
  function progressCeiling(event) {
    const phase = event && (event.realtime ? REALTIME_PHASES : PHASES)[event.phase];
    return phase ? phase.to : null;
  }

  // Shown progress eases toward the latest reported ratio and never goes backwards. With a
  // ceiling it creeps slowly toward 60 % of the way to it while stalled. `fast` finishes quickly.
  const SMOOTH_MS = 260;
  const SMOOTH_FAST_MS = 90;
  const CREEP_MS = 7000;
  const CREEP_SHARE = 0.6;
  function smoothProgress(shown, target, dtMs, opts) {
    const s = clamp(isNum(shown) ? shown : 0, 0, 1);
    if (!isNum(target)) return s;
    const o = opts || {};
    const dt = isNum(dtMs) && dtMs > 0 ? dtMs : 0;
    const goal = clamp(target, 0, 1);
    let next = s;
    if (goal > s + 1e-4) {
      next = s + (goal - s) * (1 - Math.exp(-dt / (o.fast ? SMOOTH_FAST_MS : SMOOTH_MS)));
    } else if (isNum(o.ceiling) && o.ceiling > goal) {
      const soft = goal + (Math.min(o.ceiling, 1) - goal) * CREEP_SHARE;
      if (soft > s) next = s + (soft - s) * (1 - Math.exp(-dt / CREEP_MS));
    } else if (goal > s) {
      next = goal;
    }
    return clamp(Math.max(s, next), 0, 1);
  }

  // ---------- halftone build progress (S12) ----------
  // data: RGBA bytes of an n×n downsample of the first output frame. tone (0..1) is how big a
  // dot gets once revealed: bright areas on a dark surface, dark areas on a light one, stretched
  // over the opaque pixels so low-contrast frames still read. alpha keeps shaped stickers' holes.
  // span: the diagonal extent ((u + v) / 2) of the opaque cells, so the sweep covers the content.
  const FLAT_TONE = 0.55;
  function halftoneSamples(data, n, darkSurface) {
    const count = n * n;
    const tone = new Array(count).fill(FLAT_TONE);
    const alpha = new Array(count).fill(1);
    const span = { from: 0, to: 1 };
    if (!data || data.length < count * 4) return { n, tone, alpha, span, soft: tone.slice() };
    let dLo = Infinity;
    let dHi = -Infinity;
    const lum = new Array(count);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < count; i++) {
      const p = i * 4;
      lum[i] = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
      alpha[i] = data[p + 3] / 255;
      if (alpha[i] > 0.1) {
        lo = Math.min(lo, lum[i]);
        hi = Math.max(hi, lum[i]);
        const d = ((i % n) + 0.5 + Math.floor(i / n) + 0.5) / (2 * n);
        dLo = Math.min(dLo, d);
        dHi = Math.max(dHi, d);
      }
    }
    const range = hi - lo;
    for (let i = 0; i < count; i++) {
      if (!(range > 0.02)) continue;
      const v = clamp((lum[i] - lo) / range, 0, 1);
      tone[i] = darkSurface ? v : 1 - v;
    }
    if (dHi > dLo) {
      span.from = dLo;
      span.to = dHi;
    }
    return { n, tone, alpha, span, soft: softenTone(tone, alpha, n) };
  }

  // `soft`: the tone blurred with a 7-tap binomial kernel (σ ≈ 1.2 cells) in both directions,
  // weighted by alpha so transparent cells do not pull edges down. Hard content edges (a cut,
  // bars, text) become a ramp over several columns instead of a step between two dots.
  const SOFT_KERNEL = [1, 6, 15, 20, 15, 6, 1];
  function softenTone(tone, alpha, n) {
    const pass = (src, horizontal) => {
      const out = new Array(src.length);
      const half = (SOFT_KERNEL.length - 1) / 2;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          let sum = 0;
          let weight = 0;
          for (let k = -half; k <= half; k++) {
            const ii = horizontal ? i + k : i;
            const jj = horizontal ? j : j + k;
            if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
            const w = SOFT_KERNEL[k + half] * (alpha[jj * n + ii] > 0.05 ? 1 : 0);
            sum += w * src[jj * n + ii];
            weight += w;
          }
          out[j * n + i] = weight > 0 ? sum / weight : src[j * n + i];
        }
      }
      return out;
    };
    return pass(pass(tone, true), false);
  }

  const smoothstep = (x) => x * x * (3 - 2 * x);
  // Local reveal (0..1) of the cell at (u, v), 0..1 of the square: a diagonal front from the
  // top-left to the bottom-right with a soft edge `soft` wide. 0 at progress 0, 1 at progress 1.
  // span ({ from, to }, see halftoneSamples) maps the front onto the opaque content only.
  function sweepReveal(progress, u, v, soft, span) {
    const w = isNum(soft) && soft > 0 ? soft : 0.35;
    const p = clamp(isNum(progress) ? progress : 0, 0, 1);
    const from = span && isNum(span.from) ? span.from : 0;
    const to = span && isNum(span.to) && span.to > from ? span.to : from + 1;
    const d = clamp(((isNum(u) ? u : 0) + (isNum(v) ? v : 0)) / 2 - from, 0, to - from) / (to - from);
    return smoothstep(clamp((p * (1 + w) - d) / w, 0, 1));
  }

  // Dot for one cell: unrevealed cells show a small seed dot; revealed ones grow to their tone.
  const SEED_R = 0.28;
  const MIN_TONE_R = 0.36;
  function halftoneDot(reveal, tone, alpha, maxR) {
    const rv = clamp(isNum(reveal) ? reveal : 0, 0, 1);
    const target = MIN_TONE_R + (1 - MIN_TONE_R) * clamp(isNum(tone) ? tone : FLAT_TONE, 0, 1);
    const a = clamp(isNum(alpha) ? alpha : 1, 0, 1);
    return { r: (isNum(maxR) ? maxR : 0) * a * (SEED_R + (target - SEED_R) * rv), a: 0.4 + 0.6 * rv };
  }

  // One frame of the halftone: dot centers sit on a fixed n×n grid (constant pitch, straight
  // rows; they never depend on progress or time), only radius and opacity change. Reveal comes
  // from the soft diagonal sweep (or plain progress with `reduce`), size from the softened tone.
  // opts: { reduce, time (s, enables the shimmer) }.
  const SWEEP_SOFT = 0.35;
  function halftoneFrame(samples, progress, size, opts) {
    const o = opts || {};
    const n = samples && samples.n > 0 ? samples.n : 1;
    const soft = samples.soft || samples.tone;
    const cell = size / n;
    const maxR = cell * 0.47;
    const p = clamp(isNum(progress) ? progress : 0, 0, 1);
    const shine = !o.reduce && isNum(o.time);
    const dots = new Array(n * n);
    for (let j = 0; j < n; j++) {
      const v = (j + 0.5) / n;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const idx = j * n + i;
        const reveal = o.reduce ? p : sweepReveal(p, u, v, SWEEP_SOFT, samples.span);
        const dot = halftoneDot(reveal, soft[idx], samples.alpha[idx], maxR);
        const glint = shine ? shimmer(u, v, o.time) : 0;
        dots[idx] = { x: (i + 0.5) * cell, y: (j + 0.5) * cell, r: dot.r * (1 + 0.06 * glint), a: Math.min(1, dot.a + 0.3 * glint) };
      }
    }
    return { dots, maxR };
  }

  // A narrow diagonal glint (0..1) that travels across the grid, about one pass every 1.7 s.
  function shimmer(u, v, timeSec) {
    const phase = (isNum(u) ? u : 0) * 1.2 + (isNum(v) ? v : 0) * 0.6 - (isNum(timeSec) ? timeSec : 0) * 0.6;
    const s = 0.5 + 0.5 * Math.sin(phase * 2 * Math.PI);
    return s * s * s * s;
  }

  // Step 3 view: building | error | waiting | ready | sending | success.
  function sendViewState(flags) {
    const f = flags || {};
    if (f.sent) return "success";
    if (f.buildError || f.sendError) return "error";
    if (f.building || !f.result) return "building";
    if (f.sending) return "sending";
    return f.waReady ? "ready" : "waiting";
  }

  function clampStep(step, hasVideo) {
    if (!hasVideo || !isNum(step)) return 1;
    return clamp(Math.round(step), 1, 3);
  }

  // ---------- layers (S10): text and emoji placed directly on the preview ----------
  // Layer = { id, type: "text" | "emoji", text, x, y, scale, style, color, start, end }
  // x, y: layer center, 0..1 of the output square. scale: font size relative to the output size.

  const LAYER_LIMITS = {
    text: { min: 0.04, max: 0.3, def: 0.11 },
    emoji: { min: 0.06, max: 0.6, def: 0.26 },
  };
  const TEXT_STYLES = ["meme", "bubble", "label", "shadow"];
  const STYLE_COLORS = { meme: "#ffffff", bubble: "#ffffff", label: "#008069", shadow: "#ffffff" };
  const NEW_TEXT_Y = 0.84;
  const CAPTION_Y = { top: 0.12, bottom: 0.88 };
  const WHOLE_CLIP_EPS = 1e-3;

  const layerType = (type) => (type === "emoji" ? "emoji" : "text");
  const layerStyle = (style) => (TEXT_STYLES.includes(style) ? style : "meme");

  function createLayer(type, props, id, clipLen) {
    const kind = layerType(type);
    const p = props || {};
    const style = layerStyle(p.style);
    const len = isNum(clipLen) && clipLen > 0 ? clipLen : 0;
    return {
      id,
      type: kind,
      text: String(p.text ?? ""),
      x: isNum(p.x) ? p.x : 0.5,
      y: isNum(p.y) ? p.y : kind === "emoji" ? 0.42 : NEW_TEXT_Y,
      scale: isNum(p.scale) ? p.scale : LAYER_LIMITS[kind].def,
      style,
      color: typeof p.color === "string" && p.color ? p.color : STYLE_COLORS[style],
      start: isNum(p.start) ? p.start : 0,
      end: isNum(p.end) ? p.end : len,
    };
  }

  // Keeps the whole box ({w, h}, normalized at the layer's scale) inside the square; a box wider
  // than the square is centered. Without a box the center point stays inside 0..1.
  function clampAxis(value, half) {
    const v = isNum(value) ? value : 0.5;
    return half >= 0.5 ? 0.5 : clamp(v, half, 1 - half);
  }
  function clampLayer(layer, box) {
    const limits = LAYER_LIMITS[layerType(layer && layer.type)];
    const scale = clamp(isNum(layer.scale) ? layer.scale : limits.def, limits.min, limits.max);
    const w = box && isNum(box.w) ? Math.max(0, box.w) : 0;
    const h = box && isNum(box.h) ? Math.max(0, box.h) : 0;
    return { ...layer, scale, x: clampAxis(layer.x, w / 2), y: clampAxis(layer.y, h / 2) };
  }

  function moveLayer(layer, dx, dy, box) {
    return clampLayer({ ...layer, x: layer.x + (isNum(dx) ? dx : 0), y: layer.y + (isNum(dy) ? dy : 0) }, box);
  }

  // The box grows with the scale, so the position is re-clamped with the scaled box.
  function resizeLayer(layer, factor, box) {
    const limits = LAYER_LIMITS[layerType(layer && layer.type)];
    const from = clamp(isNum(layer.scale) ? layer.scale : limits.def, limits.min, limits.max);
    const to = isNum(factor) && factor > 0 ? clamp(from * factor, limits.min, limits.max) : from;
    const ratio = to / from;
    const scaled = box ? { w: box.w * ratio, h: box.h * ratio } : null;
    return clampLayer({ ...layer, scale: to }, scaled);
  }

  // boxes: [{ id, x, y, w, h }] in z-order (last is on top), centers and sizes normalized.
  function hitTest(boxes, x, y, pad) {
    if (!Array.isArray(boxes)) return null;
    const extra = isNum(pad) ? pad : 0;
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      if (!b) continue;
      if (Math.abs(x - b.x) <= b.w / 2 + extra && Math.abs(y - b.y) <= b.h / 2 + extra) return b.id;
    }
    return null;
  }

  function bringToFront(layers, id) {
    const list = Array.isArray(layers) ? layers.slice() : [];
    const i = list.findIndex((layer) => layer && layer.id === id);
    if (i < 0 || i === list.length - 1) return list;
    const [layer] = list.splice(i, 1);
    list.push(layer);
    return list;
  }

  // Timing bar drag: part "start" | "end" | "body"; dt in seconds; snaps to 0.1 s and keeps
  // start < end (min 0.1 s) inside [0, clipLen]. The body keeps its length.
  function dragTrack(times, part, dt, clipLen) {
    const len = isNum(clipLen) && clipLen > 0 ? clipLen : 0;
    const minLen = Math.min(STEP_SEC, len);
    let start = clamp(times && isNum(times.start) ? times.start : 0, 0, len);
    let end = clamp(times && isNum(times.end) ? times.end : len, 0, len);
    if (end < start) [start, end] = [end, start];
    const d = isNum(dt) ? dt : 0;
    if (part === "start") {
      start = clamp(snap(start + d), 0, Math.max(0, end - minLen));
    } else if (part === "end") {
      end = clamp(snap(end + d), Math.min(len, start + minLen), len);
    } else {
      const span = Math.max(end - start, minLen);
      start = clamp(snap(start + d), 0, Math.max(0, len - span));
      end = start + span;
    }
    return { start: clean(start), end: clean(Math.min(end, len)) };
  }

  // After a trim change: layers that spanned the whole clip keep spanning it; others are clamped.
  function refitLayerTimes(layers, oldLen, newLen) {
    if (!Array.isArray(layers)) return [];
    const len = isNum(newLen) && newLen > 0 ? newLen : 0;
    return layers.map((layer) => {
      if (!layer) return layer;
      const whole = isNum(oldLen) && layer.start <= WHOLE_CLIP_EPS && layer.end >= oldLen - WHOLE_CLIP_EPS;
      if (whole) return { ...layer, start: 0, end: len };
      const end = clamp(isNum(layer.end) ? layer.end : len, Math.min(STEP_SEC, len), len);
      const start = clamp(isNum(layer.start) ? layer.start : 0, 0, Math.max(0, end - STEP_SEC));
      return { ...layer, start: clean(start), end: clean(end) };
    });
  }

  // Old Caption {text, start, end, position} -> a centered meme text layer.
  function captionToLayer(caption, id) {
    const c = caption || {};
    return createLayer("text", { text: c.text, start: c.start, end: c.end, x: 0.5, y: c.position === "top" ? CAPTION_Y.top : CAPTION_Y.bottom, scale: 0.125 }, id);
  }

  // Layers ready for drawing/encoding: captions migrated, empty text dropped, times inside the
  // clip with start < end. Unlike captions, the order is kept: it is the z-order.
  function normalizeLayers(items, clipDuration) {
    if (!Array.isArray(items)) return [];
    const total = isNum(clipDuration) && clipDuration > 0 ? clipDuration : 0;
    const out = [];
    items.forEach((item, index) => {
      if (!item) return;
      const layer = item.type ? clampLayer(createLayer(item.type, item, item.id, total)) : captionToLayer(item, item.id ?? "caption-" + index);
      layer.text = layer.text.trim();
      if (!layer.text) return;
      let start = clamp(isNum(layer.start) ? layer.start : 0, 0, total);
      let end = clamp(isNum(layer.end) ? layer.end : total, 0, total);
      if (end < start) [start, end] = [end, start];
      if (end === start) end = Math.min(total, start + DEFAULT_CUE_SEC);
      if (end === start) start = Math.max(0, end - DEFAULT_CUE_SEC);
      if (end <= start) return;
      out.push({ ...layer, start, end });
    });
    return out;
  }

  // ---------- undo / redo ----------
  // Immutable: every call returns a new history. Snapshots are plain data compared by JSON.

  const HISTORY_LIMIT = 50;
  const COALESCE_MS = 1000;
  const sameSnapshot = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function createHistory(snapshot, limit) {
    return { past: [], present: snapshot, future: [], limit: isNum(limit) && limit > 0 ? limit : HISTORY_LIMIT, key: null, at: 0 };
  }
  // key + now: bursts of edits with the same key less than 1 s apart become one undo step.
  function pushHistory(history, snapshot, key, now) {
    const h = history;
    if (sameSnapshot(h.present, snapshot)) return h;
    const t = isNum(now) ? now : 0;
    if (key && key === h.key && isNum(now) && t - h.at < COALESCE_MS) {
      return { ...h, present: snapshot, future: [], at: t };
    }
    const past = [...h.past, h.present].slice(-h.limit);
    return { ...h, past, present: snapshot, future: [], key: key || null, at: t };
  }
  function undoHistory(history) {
    const h = history;
    if (!h.past.length) return h;
    return { ...h, past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], key: null };
  }
  function redoHistory(history) {
    const h = history;
    if (!h.future.length) return h;
    return { ...h, past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), key: null };
  }
  const canUndo = (history) => Boolean(history && history.past.length);
  const canRedo = (history) => Boolean(history && history.future.length);

  // ---------- smoothness estimate (S13 b) ----------

  // Word + bar count (never color alone) for the predicted frame rate. estimate: the result of
  // media.estimateSmoothness ({ chosen: { fps } | null, suggestedSec }), or null while pending.
  // spoken: what the polite status region reads; empty while pending so nothing is announced.
  const SMOOTH_LEVELS = [
    { min: 15, level: "great", bars: 4, word: "muy fluido" },
    { min: 10, level: "good", bars: 3, word: "fluido" },
    { min: 8, level: "ok", bars: 2, word: "aceptable" },
    { min: 0, level: "low", bars: 1, word: "entrecortado" },
  ];
  function smoothnessLabel(estimate) {
    if (!estimate) return { level: "pending", bars: 0, text: "Calculando…", spoken: "" };
    if (!estimate.chosen) {
      const sec = String(estimate.suggestedSec).replace(".", ",");
      return { level: "none", bars: 0, text: `No cabe · acorta a ~${sec} s`, spoken: `No cabe en el límite de tamaño. Acórtalo a unos ${sec} segundos.` };
    }
    const fps = estimate.chosen.fps;
    const l = SMOOTH_LEVELS.find((x) => fps >= x.min);
    return { level: l.level, bars: l.bars, text: `≈ ${fps} cuadros/s · ${l.word}`, spoken: `Fluidez estimada: unos ${fps} cuadros por segundo, ${l.word}.` };
  }

  SV.uiModel = {
    LAYER_LIMITS,
    TEXT_STYLES,
    STYLE_COLORS,
    createLayer,
    clampLayer,
    moveLayer,
    resizeLayer,
    hitTest,
    bringToFront,
    dragTrack,
    refitLayerTimes,
    captionToLayer,
    normalizeLayers,
    createHistory,
    pushHistory,
    undoHistory,
    redoHistory,
    canUndo,
    canRedo,
    MIN_CROP_RATIO,
    STEP_SEC,
    defaultCrop,
    clampCrop,
    zoomCrop,
    panCrop,
    clampRange,
    normalizeCues,
    moveTrimHandle,
    timeToRatio,
    filmWindow,
    windowRatio,
    windowTime,
    needsRefocus,
    placeRange,
    shiftRange,
    overviewGrab,
    fmtClock,
    cueAtPlayhead,
    setCueEdge,
    initials,
    avatarHue,
    orderChats,
    pickChatId,
    buildProgress,
    progressCeiling,
    smoothProgress,
    rulerLayout,
    thumbSlots,
    halftoneSamples,
    sweepReveal,
    halftoneDot,
    shimmer,
    halftoneFrame,
    sendViewState,
    clampStep,
    smoothnessLabel,
  };
})(globalThis);
