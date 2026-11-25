// buildSticker option handling with stubbed browser APIs: what reaches drawFrame for every frame.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadStickerVox } = require("./helpers/load.js");

class FakeCanvas {
  constructor(w, h) {
    this.width = w;
    this.height = h;
  }
  getContext() {
    return { clearRect() {}, drawImage() {}, getImageData: (x, y, w, h) => ({ data: new Uint8Array(w * h * 4) }) };
  }
}

function fakeVideo(duration) {
  const listeners = {};
  let time = 0;
  return {
    duration,
    pause() {},
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    removeEventListener(type) {
      delete listeners[type];
    },
    get currentTime() {
      return time;
    },
    set currentTime(value) {
      time = value;
      const fn = listeners.seeked;
      delete listeners.seeked;
      if (fn) Promise.resolve().then(fn);
    },
  };
}

function setup() {
  const SV = loadStickerVox(["src/media/webp.js", "src/media/build.js"], {
    OffscreenCanvas: FakeCanvas,
    createImageBitmap: async () => ({ close() {} }),
    Blob,
    setTimeout,
    clearTimeout,
    Promise,
    Map,
  });
  SV.log = () => {};
  const draws = [];
  Object.assign(SV.media, {
    drawFrame: (ctx, source, crop, items, tRel, size, options) => draws.push({ items, tRel, size, options }),
    encodeStillWebp: async () => new Uint8Array([1]),
    muxAnimatedWebp: () => new Uint8Array(10),
    extractAudio: async () => ({ channels: [new Float32Array(4)], sampleRate: 48000 }),
    normalizePeak: (channels) => channels,
    encodeOggOpus: async () => new Blob([new Uint8Array(4)], { type: "audio/ogg; codecs=opus" }),
  });
  return { SV, draws };
}

const base = (extra) => ({ file: {}, video: fakeVideo(10), start: 0, end: 0.2, crop: { x: 0, y: 0, size: 100 }, ...extra });

test("buildSticker still accepts captions and draws the default square", async () => {
  const { SV, draws } = setup();
  const captions = [{ text: "hola", start: 0, end: 1, position: "bottom" }];
  const out = await SV.media.buildSticker(base({ captions }));
  assert.equal(out.width, 512);
  assert.equal(draws.length, 3, "15 fps over 0.2 s");
  for (const draw of draws) {
    assert.equal(draw.items, captions);
    assert.equal(draw.size, 512);
    assert.deepEqual(JSON.parse(JSON.stringify(draw.options)), { shape: "square", outline: false });
  }
});

test("buildSticker passes layers, shape and outline to drawFrame", async () => {
  const { SV, draws } = setup();
  const layers = [{ id: 1, type: "emoji", text: "🔥", x: 0.5, y: 0.5, scale: 0.3, start: 0, end: 1 }];
  await SV.media.buildSticker(base({ layers, captions: [{ text: "ignored", start: 0, end: 1 }], shape: "circle", outline: true }));
  assert.equal(draws[0].items, layers, "layers win over captions");
  assert.deepEqual(JSON.parse(JSON.stringify(draws[0].options)), { shape: "circle", outline: true });
});

test("buildSticker falls back to the square for unknown shapes", async () => {
  const { SV, draws } = setup();
  await SV.media.buildSticker(base({ layers: [], shape: "star", outline: "yes" }));
  assert.deepEqual(JSON.parse(JSON.stringify(draws[0].options)), { shape: "square", outline: true });
});

test("LIMITS allow clips up to 15 s (WhatsApp delivered and played 15 s sound stickers in a live test)", () => {
  const SV = loadStickerVox(["src/media/webp.js", "src/media/ogg.js", "src/media/audio.js", "src/media/render.js", "src/media/build.js"]);
  assert.equal(SV.media.LIMITS.maxClipSec, 15);
  assert.equal(SV.media.LIMITS.maxWebpBytes, 1000 * 1024); // 1023 KB delivered and animated on the phone; 1520 KB rejected
});

// ---------- S11: long videos ----------
const plainEvents = (events) => JSON.parse(JSON.stringify(events));
const round3 = (v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v);

test("buildSticker reports the same progress events as before for small files", async () => {
  const { SV } = setup();
  SV.media.audioStrategy = () => "decode";
  const events = [];
  await SV.media.buildSticker(base({ file: { size: 1000 }, onProgress: (e) => events.push(e) }));
  const audio = plainEvents(events.filter((e) => e.phase === "audio"));
  assert.deepEqual(audio, [{ phase: "audio", ratio: 0 }, { phase: "audio", ratio: 0.5 }, { phase: "audio", ratio: 1 }]);
  assert.ok(events.every((e) => !("realtime" in e)), "no real-time flag on the fast path");
  assert.equal(SV.media.LIMITS.fullDecodeMaxBytes, 50 * 1024 * 1024);
  assert.equal(SV.media.LIMITS.fullDecodeMaxSec, 120);
});

test("buildSticker forwards the real-time capture position as audio progress", async () => {
  const { SV } = setup();
  const calls = [];
  SV.media.audioStrategy = (bytes, duration, limits) => (calls.push([bytes, duration, limits.fullDecodeMaxBytes]), "capture");
  SV.media.extractAudio = async (file, start, end, options) => {
    calls.push([start, end, options.duration]);
    options.onProgress(0.5);
    options.onProgress(1);
    return { channels: [new Float32Array(4)], sampleRate: 48000 };
  };
  const events = [];
  const video = fakeVideo(1200);
  await SV.media.buildSticker(base({ file: { size: 300e6 }, video, start: 600, end: 600.2, onProgress: (e) => events.push(e) }));
  assert.deepEqual(calls[0], [300e6, 1200, 50 * 1024 * 1024]);
  assert.deepEqual(calls[1].map(round3), [600, 600.2, 1200]);
  assert.ok(events.every((e) => e.realtime === true), "every phase knows the audio is recorded in real time");
  const audio = plainEvents(events.filter((e) => e.phase === "audio")).map((e) => [e.ratio, e.recordedSec, e.totalSec].map(round3));
  assert.deepEqual(audio, [
    [0, 0, 0.2],
    [0.475, 0.1, 0.2],
    [0.95, 0.2, 0.2],
    [0.95, undefined, undefined],
    [1, undefined, undefined],
  ]);
});

test("webpAttempts prioritizes smoothness: quality drops to 0.2 before fps drops", () => {
  const SV = loadStickerVox(["src/media/webp.js", "src/media/ogg.js", "src/media/audio.js", "src/media/render.js", "src/media/build.js"]);
  const attempts = JSON.parse(JSON.stringify(SV.media.webpAttempts()));
  const index = (q, fps) => attempts.findIndex((a) => a.quality === q && a.fps === fps);
  // Best-looking first, smallest last (a failure then reports the best possible size).
  assert.deepEqual(attempts[0], { quality: 0.8, fps: 15 });
  assert.deepEqual(attempts[attempts.length - 1], { quality: 0.1, fps: 5 });
  // fps never goes back up along the ladder.
  for (let i = 1; i < attempts.length; i++) assert.ok(attempts[i].fps <= attempts[i - 1].fps, `fps non-increasing at ${i}`);
  // Every fps from 10 up is tried at quality 0.2 before any lower fps.
  for (const fps of [15, 12, 10]) {
    const lowerFpsStart = attempts.findIndex((a) => a.fps < fps);
    assert.ok(index(0.2, fps) >= 0 && index(0.2, fps) < lowerFpsStart, `${fps} fps reaches quality 0.2 first`);
  }
  // The user's clip case: 10 fps at 0.2 (908 KB) comes before 8 fps at 0.35 (868 KB).
  assert.ok(index(0.2, 10) < index(0.35, 8));
  // Quality 0.1 is reserved for 8 fps and below; never below 5 fps or 0.1.
  assert.ok(attempts.every((a) => a.quality > 0.1 || a.fps <= 8));
  assert.ok(attempts.every((a) => a.fps >= 5 && a.quality >= 0.1));
});

test("suggestedClipSec estimates how many seconds would fit, rounded down to 0.5 s", () => {
  const SV = loadStickerVox(["src/media/webp.js", "src/media/ogg.js", "src/media/audio.js", "src/media/render.js", "src/media/build.js"]);
  // 10.8 s produced 600 KB at the smallest setting; 500 KB fits ~9 s.
  assert.equal(SV.media.suggestedClipSec(10.8, 600 * 1024, 500 * 1024), 9);
  assert.equal(SV.media.suggestedClipSec(10, 2000 * 1024, 500 * 1024), 2.5);
  // Never suggests less than 1 s.
  assert.equal(SV.media.suggestedClipSec(10, 100000 * 1024, 500 * 1024), 1);
});

// ---------- S13: delta frames in the build, smoothness prediction ----------

// Canvas fake that remembers what was drawn: bitmaps carry an RGBA frame, getImageData returns it.
function pixelSetup(frameAt) {
  let made = 0;
  const encoded = [];
  class PixelCanvas {
    constructor(w, h) {
      this.width = w;
      this.height = h;
      this.shown = null;
      this.crop = null;
    }
    getContext() {
      const canvas = this;
      return {
        clearRect() {},
        drawImage(bitmap, sx, sy, sw, sh) {
          canvas.shown = bitmap;
          canvas.crop = sw === undefined ? null : { x: sx, y: sy, width: sw, height: sh };
        },
        getImageData() {
          return { data: Uint8Array.from(canvas.shown.rgba) };
        },
      };
    }
  }
  const SV = loadStickerVox(["src/media/webp.js", "src/media/build.js"], {
    OffscreenCanvas: PixelCanvas,
    createImageBitmap: async () => ({ rgba: frameAt(made++), close() {} }),
    Blob,
    setTimeout,
    clearTimeout,
    Promise,
    Map,
    Set,
    Uint16Array,
  });
  SV.log = () => {};
  const muxed = [];
  Object.assign(SV.media, {
    drawFrame: () => {},
    encodeStillWebp: async (canvas, quality) => {
      encoded.push({ width: canvas.width, height: canvas.height, crop: canvas.crop, quality });
      return new Uint8Array([1]);
    },
    muxAnimatedWebp: (stills, options) => {
      muxed.push({ count: stills.length, options: JSON.parse(JSON.stringify(options)) });
      return new Uint8Array(10);
    },
    extractAudio: async () => ({ channels: [new Float32Array(4)], sampleRate: 48000 }),
    normalizePeak: (channels) => channels,
    encodeOggOpus: async () => new Blob([new Uint8Array(4)], { type: "audio/ogg; codecs=opus" }),
  });
  return { SV, muxed, encoded };
}
const frame512 = (block) => {
  const out = new Uint8Array(512 * 512 * 4).fill(255);
  if (block) for (let y = 100; y < 116; y++) for (let x = 200; x < 216; x++) out.set([0, 0, 0, 255], (y * 512 + x) * 4);
  return out;
};

test("buildSticker keeps small clips at 15 fps and merges a still clip into one long frame", async () => {
  const { SV, muxed } = pixelSetup(() => frame512(false));
  const out = await SV.media.buildSticker(base({ end: 1 }));
  assert.equal(out.fps, 15, "the first ladder step fits");
  assert.equal(out.quality, 0.8);
  assert.equal(muxed.length, 1);
  assert.equal(muxed[0].count, 1, "15 identical frames become one frame");
  assert.deepEqual(muxed[0].options.frameDurationsMs, [1000], "shown for the whole clip");
  assert.deepEqual(muxed[0].options.frames, [{ x: 0, y: 0, width: 512, height: 512, blend: false, dispose: false }]);
});

test("buildSticker encodes only the changed sub-rect of a frame, cropped from the rendered frame", async () => {
  const { SV, muxed, encoded } = pixelSetup((i) => frame512(i % 2 === 1));
  await SV.media.buildSticker(base({ end: 0.2 }));
  const frames = muxed[0].options.frames;
  assert.equal(muxed[0].count, 3);
  assert.deepEqual(frames[0], { x: 0, y: 0, width: 512, height: 512, blend: false, dispose: false }, "first frame is a keyframe");
  assert.deepEqual(frames[1], { x: 192, y: 88, width: 32, height: 40, blend: true, dispose: false }, "block-aligned change + 8 px margin, even offsets");
  assert.deepEqual(frames[2], frames[1], "the block disappearing is sent the same way");
  assert.deepEqual(muxed[0].options.frameDurationsMs, [67, 66, 67]);
  const sub = encoded.filter((e) => e.width !== 512);
  assert.equal(sub.length, 2);
  for (const e of sub) {
    assert.equal(e.width, 32);
    assert.equal(e.height, 40);
    assert.deepEqual(e.crop, { x: 192, y: 88, width: 32, height: 40 });
  }
});

test("deltaShareAt interpolates the per-frame cost over the frame interval and clamps outside", () => {
  const SV = loadStickerVox(["src/media/webp.js", "src/media/build.js"]);
  const measured = [{ fps: 15, share: 0.2 }, { fps: 10, share: 0.4 }, { fps: 5, share: 0.8 }];
  const at = (fps) => Math.round(SV.media.deltaShareAt(measured, fps) * 1000) / 1000;
  assert.equal(at(15), 0.2);
  assert.equal(at(12), 0.3, "1/12 s lies halfway between 1/15 s and 1/10 s");
  assert.equal(at(10), 0.4);
  assert.equal(at(30), 0.2);
  assert.equal(at(4), 0.8);
  assert.equal(SV.media.deltaShareAt([{ fps: 10, share: 0.5 }], 6), 0.5);
  assert.equal(SV.media.deltaShareAt([], 6), 1, "nothing measured: assume full frames");
});

test("predictLadder predicts bytes per ladder step and picks the first that fits", () => {
  const SV = loadStickerVox(["src/media/webp.js", "src/media/build.js"]);
  const attempts = [{ quality: 0.8, fps: 15 }, { quality: 0.2, fps: 15 }, { quality: 0.2, fps: 10 }];
  const shares = [{ fps: 15, share: 0.25 }, { fps: 10, share: 0.5 }];
  const fits = SV.media.predictLadder({ durationSec: 10, maxBytes: 1024000, attempts, fullBytes: { 0.8: 30000, 0.2: 8000 }, shares, frameOverhead: 0 });
  // 150 frames, 10 keyframes (one per second): 10 × full + 140 × share × full.
  assert.deepEqual(JSON.parse(JSON.stringify(fits.steps.map((s) => s.bytes))), [1350000, 360000, 440000]);
  assert.deepEqual(JSON.parse(JSON.stringify(fits.chosen)), { quality: 0.2, fps: 15, bytes: 360000 });
  assert.equal(fits.suggestedSec, null);

  const none = SV.media.predictLadder({ durationSec: 10, maxBytes: 500000, attempts, fullBytes: { 0.8: 1e6, 0.2: 1e5 }, shares, frameOverhead: 0 });
  assert.equal(none.chosen, null);
  assert.equal(none.smallestBytes, 4.5e6);
  assert.equal(none.suggestedSec, SV.media.suggestedClipSec(10, 4.5e6, 500000));
  assert.equal(none.suggestedSec, 1);
});
