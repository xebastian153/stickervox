// StickerVox media: audio extraction (Web Audio) and peak normalization with edge fades.
// Small files are decoded whole (fast). Large or long files are never read whole: only the
// selected segment is recorded in real time from a hidden, silent <audio> element.
(function (root) {
  const SV = root.StickerVox;
  const media = (SV.media = SV.media || {});

  // Defaults for the strategy limits; StickerVox.media.LIMITS (build.js) is the source of truth.
  const DEFAULT_DECODE_MAX_BYTES = 50 * 1024 * 1024;
  const DEFAULT_DECODE_MAX_SEC = 120;
  const CAPTURE_BUFFER = 4096; // ScriptProcessor frames per callback (~85 ms at 48 kHz)
  const CAPTURE_GRACE_MS = 20000; // timeout = clip length + this
  const CAPTURE_TAIL_SEC = 0.15; // keep recording a little past `end`, then cut by timestamps
  const NO_AUDIO_AFTER_SEC = 1.5; // no decoded audio bytes after this much playback = no track
  const OPEN_TIMEOUT_MS = 10000;
  const RUN_TOLERANCE_SEC = 0.15;

  const NO_AUDIO = "No se pudo leer el audio del video (¿el archivo tiene sonido?).";
  const isNum = (value) => typeof value === "number" && Number.isFinite(value);

  // Pure: "decode" reads and decodes the whole file (fast, memory ~ whole track);
  // "capture" records only the segment in real time (memory ~ segment).
  function audioStrategy(bytes, durationSec, limits) {
    const maxBytes = limits && isNum(limits.fullDecodeMaxBytes) ? limits.fullDecodeMaxBytes : DEFAULT_DECODE_MAX_BYTES;
    const maxSec = limits && isNum(limits.fullDecodeMaxSec) ? limits.fullDecodeMaxSec : DEFAULT_DECODE_MAX_SEC;
    if (!isNum(bytes) || bytes > maxBytes) return "capture";
    if (isNum(durationSec) && durationSec > maxSec) return "capture";
    return "decode";
  }

  const median = (values) => {
    const s = values.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  // Pure: arrivals = [{ at, length }], `at` = media clock read when the chunk arrived (its end).
  // Consecutive chunks are contiguous samples, so inside one run every chunk shares a single
  // offset (the median, to cancel clock jitter). A jump in the clock (seek, stall) starts a new run.
  function timestampChunks(arrivals, sampleRate, tolerance) {
    const tol = isNum(tolerance) ? tolerance : RUN_TOLERANCE_SEC;
    const out = new Array(arrivals.length);
    let run = [];
    let cum = 0;
    let ref = 0;
    const flush = () => {
      if (!run.length) return;
      const offset = median(run.map((item) => item.res));
      for (const item of run) out[item.i] = offset + item.cumStart / sampleRate;
      run = [];
      cum = 0;
    };
    arrivals.forEach((chunk, i) => {
      let res = chunk.at - (cum + chunk.length) / sampleRate;
      if (run.length && Math.abs(res - ref) > tol) {
        flush();
        res = chunk.at - chunk.length / sampleRate;
      }
      if (!run.length) ref = res;
      run.push({ i, cumStart: cum, res });
      cum += chunk.length;
    });
    flush();
    return out;
  }

  // Pure: places timestamped chunks ({ time, channels }) on a buffer of exactly
  // round((end - start) * sampleRate) samples. Gaps stay silent; later chunks win on overlap.
  function sliceByTimestamps(chunks, start, end, sampleRate) {
    const n = Math.max(0, Math.round((end - start) * sampleRate));
    const count = Math.max(1, ...chunks.map((chunk) => chunk.channels.length));
    const out = Array.from({ length: count }, () => new Float32Array(n));
    for (const chunk of chunks) {
      const offset = Math.round((chunk.time - start) * sampleRate);
      for (let c = 0; c < count; c++) {
        const src = chunk.channels[c] || chunk.channels[0];
        const from = Math.max(0, -offset);
        const to = Math.min(src.length, n - offset);
        if (to > from) out[c].set(src.subarray(from, to), offset + from);
      }
    }
    return out;
  }

  // Pure: a capture node always delivers two channels; a mono source arrives as two equal ones.
  function collapseMono(channels) {
    if (channels.length !== 2) return channels;
    const [a, b] = channels;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return channels;
    return [a];
  }

  // Fast path: decodes the file's whole audio track and returns the [start, end) slice.
  async function decodeSegment(file, start, end) {
    const Ctx = root.AudioContext || root.webkitAudioContext;
    const ctx = new Ctx();
    let buffer;
    try {
      buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    } catch (e) {
      throw new Error(NO_AUDIO);
    } finally {
      if (typeof ctx.close === "function") ctx.close();
    }
    const sampleRate = buffer.sampleRate;
    const from = Math.max(0, Math.floor(start * sampleRate));
    const to = Math.min(buffer.length, Math.ceil(end * sampleRate));
    if (to <= from) throw new Error("El fragmento elegido no contiene audio.");
    const channels = [];
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) {
      channels.push(buffer.getChannelData(c).slice(from, to));
    }
    return { channels, sampleRate };
  }

  function waitFor(target, type, ms, message) {
    return new Promise((resolve, reject) => {
      const done = (fn, value) => {
        target.removeEventListener(type, onOk);
        target.removeEventListener("error", onErr);
        root.clearTimeout(timer);
        fn(value);
      };
      const onOk = () => done(resolve);
      const onErr = () => done(reject, new Error(message));
      const timer = root.setTimeout(() => done(reject, new Error(message)), ms);
      target.addEventListener(type, onOk);
      target.addEventListener("error", onErr);
    });
  }

  // Real-time path: plays [start, end] once at 1x through Web Audio into a ScriptProcessor whose
  // output goes through a zero-gain node, so the user hears nothing. No worklet modules (WhatsApp
  // Web's CSP may block them). Memory is bounded by the segment, not the file.
  async function captureAudio(file, start, end, options) {
    const onProgress = options && typeof options.onProgress === "function" ? options.onProgress : null;
    const Ctx = root.AudioContext || root.webkitAudioContext;
    const url = URL.createObjectURL(file);
    const el = root.document.createElement("audio");
    el.preload = "auto";
    el.muted = false; // a muted element feeds silence into Web Audio; the zero-gain sink keeps it inaudible
    let ctx = null;
    let proc = null;
    const nodes = [];
    try {
      el.src = url;
      await waitFor(el, "loadedmetadata", OPEN_TIMEOUT_MS, "No se pudo abrir el audio del video.");
      const stop = isNum(el.duration) ? Math.min(end, el.duration) : end;
      if (!(stop > start)) throw new Error("El fragmento elegido no contiene audio.");
      const total = stop - start;
      const seeked = waitFor(el, "seeked", OPEN_TIMEOUT_MS, "No se pudo avanzar al inicio del fragmento.");
      el.currentTime = start;
      await seeked;

      ctx = new Ctx();
      const source = ctx.createMediaElementSource(el);
      proc = ctx.createScriptProcessor(CAPTURE_BUFFER, 2, 2);
      const sink = ctx.createGain();
      sink.gain.value = 0;
      source.connect(proc);
      proc.connect(sink); // ScriptProcessor only runs while connected to the destination
      sink.connect(ctx.destination);
      nodes.push(source, proc, sink);
      const sampleRate = ctx.sampleRate;

      const chunks = [];
      await new Promise((resolve, reject) => {
        let playing = false;
        let lastAt = -1;
        let settled = false;
        const settle = (error) => {
          if (settled) return;
          settled = true;
          root.clearTimeout(timer);
          el.removeEventListener("ended", onEnded);
          el.removeEventListener("error", onError);
          el.removeEventListener("playing", onPlaying);
          if (error) reject(error);
          else resolve();
        };
        const onEnded = () => settle();
        const onError = () => settle(new Error(NO_AUDIO));
        const onPlaying = () => {
          playing = true;
        };
        const timer = root.setTimeout(
          () => settle(new Error("Grabar el audio tardó demasiado. Vuelve a intentarlo con la pestaña abierta.")),
          total * 1000 + CAPTURE_GRACE_MS,
        );
        el.addEventListener("ended", onEnded);
        el.addEventListener("error", onError);
        el.addEventListener("playing", onPlaying);
        proc.onaudioprocess = (event) => {
          const output = event.outputBuffer;
          for (let c = 0; c < output.numberOfChannels; c++) output.getChannelData(c).fill(0);
          if (settled || !playing || el.paused || el.seeking) return;
          const at = el.currentTime;
          if (at === lastAt) return; // stalled: these samples carry no new media
          lastAt = at;
          const input = event.inputBuffer;
          const channels = [];
          for (let c = 0; c < Math.min(2, input.numberOfChannels); c++) channels.push(input.getChannelData(c).slice());
          chunks.push({ at, channels });
          const recorded = Math.min(Math.max(at - start, 0), total);
          if (onProgress) onProgress(recorded / total);
          if (recorded > NO_AUDIO_AFTER_SEC && el.webkitAudioDecodedByteCount === 0) settle(new Error(NO_AUDIO));
          else if (at >= stop + CAPTURE_TAIL_SEC) settle();
        };
        const resumed = ctx.state === "suspended" && typeof ctx.resume === "function" ? ctx.resume() : Promise.resolve();
        Promise.resolve(resumed)
          .then(() => el.play())
          .catch(() =>
            settle(new Error("El navegador no dejó reproducir el audio del fragmento. Toca «Reintentar» para grabarlo de nuevo.")),
          );
      });

      if (!chunks.length) throw new Error(NO_AUDIO);
      const starts = timestampChunks(chunks.map((chunk) => ({ at: chunk.at, length: chunk.channels[0].length })), sampleRate);
      const placed = chunks.map((chunk, i) => ({ time: starts[i], channels: chunk.channels }));
      return { channels: collapseMono(sliceByTimestamps(placed, start, stop, sampleRate)), sampleRate };
    } finally {
      try {
        el.pause();
      } catch (_) {
        /* ignore */
      }
      if (proc) proc.onaudioprocess = null;
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch (_) {
          /* ignore */
        }
      }
      if (ctx && typeof ctx.close === "function") ctx.close().catch(() => {});
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
    }
  }

  // Returns the [start, end) slice in seconds as { channels, sampleRate }.
  // options: { duration (video duration, s), onProgress(ratio 0..1) } — progress only on capture.
  async function extractAudio(file, start, end, options) {
    const opts = options || {};
    const strategy = audioStrategy(file && file.size, opts.duration, media.LIMITS);
    if (strategy === "decode") return decodeSegment(file, start, end);
    SV.log("info", "media:audio-capture", { start, end, bytes: file && file.size });
    return media.captureAudio(file, start, end, { onProgress: opts.onProgress });
  }

  // Pure: returns new channels scaled so the peak equals targetDb (unless silent or disabled),
  // with linear fade-in/out of fadeMs. Never mutates its input, never exceeds the target peak.
  function normalizePeak(channels, options) {
    const { targetDb = -1, fadeMs = 40, sampleRate = 48000, normalize = true } = options || {};
    const target = Math.pow(10, targetDb / 20);
    const out = channels.map((ch) => Float32Array.from(ch));

    let peak = 0;
    for (const ch of out) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));

    if (normalize && peak > 0) {
      const gain = target / peak;
      const limit = Math.fround(target) > target ? nextFloat32Down(target) : Math.fround(target);
      for (const ch of out) {
        for (let i = 0; i < ch.length; i++) {
          const v = ch[i] * gain;
          ch[i] = v > limit ? limit : v < -limit ? -limit : v;
        }
      }
    }

    for (const ch of out) {
      const fade = Math.min(Math.round((fadeMs / 1000) * sampleRate), Math.floor(ch.length / 2));
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        ch[i] *= k;
        ch[ch.length - 1 - i] *= k;
      }
    }
    return out;
  }

  // Largest float32 strictly below x (x is a positive finite number).
  function nextFloat32Down(x) {
    const f = new Float32Array([x]);
    const bits = new Uint32Array(f.buffer);
    bits[0] -= 1;
    return f[0];
  }

  media.audioStrategy = audioStrategy;
  media.timestampChunks = timestampChunks;
  media.sliceByTimestamps = sliceByTimestamps;
  media.collapseMono = collapseMono;
  media.captureAudio = captureAudio;
  media.extractAudio = extractAudio;
  media.normalizePeak = normalizePeak;
})(globalThis);
