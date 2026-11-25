const test = require("node:test");
const assert = require("node:assert/strict");
const { loadStickerVox } = require("./helpers/load.js");

const media = () => loadStickerVox(["src/media/audio.js"]).media;
const close = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-6, `${msg}: ${actual} != ${expected}`);
const peakOf = (chs) => Math.max(...chs.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));

function tone(n, amp, phase = 0) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = amp * Math.sin(phase + (2 * Math.PI * 440 * i) / 48000);
  return a;
}

test("normalizePeak scales the loudest sample to the target and fades both ends", () => {
  const left = tone(48000, 0.2);
  const right = tone(48000, 0.1, 1);
  left[24000] = 0.25; // peak in the middle, outside the fades
  const before = [left.slice(), right.slice()];
  const out = media().normalizePeak([left, right], { targetDb: -1, fadeMs: 40, sampleRate: 48000 });

  const target = Math.pow(10, -1 / 20);
  assert.ok(Math.abs(peakOf(out) - target) < 1e-6, "peak equals target");
  assert.ok(peakOf(out) <= target, "never above target");
  assert.ok(Math.abs(out[0][24000] - target) < 1e-6);
  const gain = target / Math.fround(0.25);
  assert.ok(Math.abs(out[1][10000] - right[10000] * gain) < 1e-6, "same gain on every channel");
  for (const ch of out) {
    assert.ok(ch[0] === 0, "fade-in starts at 0");
    assert.ok(ch[ch.length - 1] === 0, "fade-out ends at 0");
    assert.equal(ch.length, 48000);
  }
  const fadeLen = Math.round(0.04 * 48000);
  const mid = fadeLen / 2;
  assert.ok(Math.abs(out[0][mid] - left[mid] * gain * 0.5) < 1e-3, "linear fade half way");
  assert.deepEqual(left, before[0], "input not mutated");
  assert.deepEqual(right, before[1], "input not mutated");
  assert.notEqual(out[0], left);
});

test("normalizePeak leaves silence unchanged", () => {
  const silent = new Float32Array(4800);
  const out = media().normalizePeak([silent], { sampleRate: 48000 });
  assert.deepEqual(out[0], new Float32Array(4800));
});

test("normalizePeak with normalize=false keeps the level but still fades", () => {
  const ch = tone(48000, 0.3);
  const out = media().normalizePeak([ch], { sampleRate: 48000, normalize: false });
  assert.equal(out[0][24000], ch[24000]);
  assert.ok(out[0][0] === 0);
  assert.ok(out[0][47999] === 0);
});

test("normalizePeak attenuates audio that is louder than the target", () => {
  const ch = tone(48000, 1);
  const out = media().normalizePeak([ch], { sampleRate: 48000, targetDb: -3 });
  const target = Math.pow(10, -3 / 20);
  assert.ok(Math.abs(peakOf(out) - target) < 1e-6);
  assert.ok(peakOf(out) <= target);
});

// ---------- S11: long videos ----------
const MB = 1024 * 1024;

test("audioStrategy keeps the full decode for small, short inputs and captures everything else", () => {
  const m = media();
  const limits = { fullDecodeMaxBytes: 50 * MB, fullDecodeMaxSec: 120 };
  assert.equal(m.audioStrategy(10 * MB, 30, limits), "decode");
  assert.equal(m.audioStrategy(50 * MB, 120, limits), "decode", "the limits are inclusive");
  assert.equal(m.audioStrategy(50 * MB + 1, 30, limits), "capture", "too many bytes to read at once");
  assert.equal(m.audioStrategy(10 * MB, 121, limits), "capture", "too long to decode into memory");
  assert.equal(m.audioStrategy(10 * MB, NaN, limits), "decode", "unknown duration falls back to the byte limit");
  assert.equal(m.audioStrategy(undefined, 10, limits), "capture", "unknown size is never read whole");
  assert.equal(m.audioStrategy(10 * MB, 30), "decode", "defaults apply without limits");
  assert.equal(m.audioStrategy(60 * MB, 30), "capture");
});

test("timestampChunks turns arrival times into contiguous chunk start times", () => {
  const m = media();
  // 4 chunks of 4800 samples (0.1 s) whose arrival clock has a little jitter.
  const arrivals = [10.1, 10.203, 10.298, 10.401].map((at) => ({ at, length: 4800 }));
  const starts = Array.from(m.timestampChunks(arrivals, 48000));
  assert.equal(starts.length, 4);
  for (let i = 1; i < 4; i++) close(starts[i] - starts[i - 1], 0.1, "contiguous");
  assert.ok(Math.abs(starts[0] - 10) < 0.005, `first chunk starts near 10 s: ${starts[0]}`);
});

test("timestampChunks starts a new run after a jump in the media clock", () => {
  const m = media();
  const arrivals = [1.1, 1.2, 5.1, 5.2].map((at) => ({ at, length: 4800 }));
  const starts = Array.from(m.timestampChunks(arrivals, 48000));
  close(starts[0], 1.0, "run 1");
  close(starts[1], 1.1, "run 1");
  close(starts[2], 5.0, "run 2");
  close(starts[3], 5.1, "run 2");
  assert.deepEqual(Array.from(m.timestampChunks([], 48000)), []);
});

test("sliceByTimestamps cuts the samples to exactly end - start using chunk times", () => {
  const m = media();
  const sr = 10;
  const ramp = (from, n) => Float32Array.from({ length: n }, (_, i) => from + i);
  // Chunks cover 0.5..1.5 s and 1.5..2.5 s; the clip is 1..2 s.
  const chunks = [
    { time: 0.5, channels: [ramp(5, 10), ramp(105, 10)] },
    { time: 1.5, channels: [ramp(15, 10), ramp(115, 10)] },
  ];
  const out = m.sliceByTimestamps(chunks, 1, 2, sr);
  assert.equal(out.length, 2);
  assert.deepEqual(Array.from(out[0]), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  assert.deepEqual(Array.from(out[1]), [110, 111, 112, 113, 114, 115, 116, 117, 118, 119]);
});

test("sliceByTimestamps fills gaps with silence and lets later chunks win on overlap", () => {
  const m = media();
  const ones = (n, v) => new Float32Array(n).fill(v);
  const out = m.sliceByTimestamps(
    [
      { time: 0, channels: [ones(4, 1)] },
      { time: 0.2, channels: [ones(4, 2)] }, // overlaps samples 2..3
      { time: 0.8, channels: [ones(4, 3)] }, // runs past the end
    ],
    0,
    1,
    10,
  );
  assert.equal(out.length, 1);
  assert.deepEqual(Array.from(out[0]), [1, 1, 2, 2, 2, 2, 0, 0, 3, 3]);
  assert.equal(m.sliceByTimestamps([], 0, 1, 10)[0].length, 10, "no chunks: silence of the right length");
});

test("collapseMono drops a right channel identical to the left one", () => {
  const m = media();
  const a = Float32Array.from([0.1, -0.2, 0.3]);
  assert.equal(m.collapseMono([a, a.slice()]).length, 1);
  assert.equal(m.collapseMono([a, Float32Array.from([0.1, -0.2, 0.31])]).length, 2);
  assert.equal(m.collapseMono([a]).length, 1);
});

function fakeDecodeCtx(seconds, sampleRate, calls) {
  return class {
    async decodeAudioData() {
      calls.decoded++;
      const n = seconds * sampleRate;
      const data = [Float32Array.from({ length: n }, (_, i) => i), Float32Array.from({ length: n }, (_, i) => -i)];
      return { sampleRate, length: n, numberOfChannels: 2, getChannelData: (c) => data[c] };
    }
    close() {
      calls.closed++;
    }
  };
}

test("extractAudio keeps the fast full-decode path for small files (previous behavior)", async () => {
  const calls = { decoded: 0, closed: 0, read: 0, captured: 0 };
  const SV = loadStickerVox(["src/media/audio.js"], { AudioContext: fakeDecodeCtx(4, 100, calls) });
  SV.media.captureAudio = async () => {
    calls.captured++;
  };
  const file = { size: 1000, arrayBuffer: async () => (calls.read++, new ArrayBuffer(8)) };
  const out = await SV.media.extractAudio(file, 1, 2.5);
  assert.equal(out.sampleRate, 100);
  assert.equal(out.channels.length, 2);
  assert.equal(out.channels[0].length, 150);
  assert.equal(out.channels[0][0], 100);
  assert.equal(out.channels[1][149], -249);
  assert.deepEqual([calls.read, calls.decoded, calls.closed, calls.captured], [1, 1, 1, 0]);
});

test("extractAudio captures only the segment of large files and never reads them whole", async () => {
  const calls = { decoded: 0, closed: 0, read: 0, captured: 0 };
  const SV = loadStickerVox(["src/media/audio.js"], { AudioContext: fakeDecodeCtx(4, 100, calls) });
  const seen = [];
  SV.media.captureAudio = async (file, start, end, options) => {
    seen.push([start, end, typeof options.onProgress]);
    return { channels: [new Float32Array(3)], sampleRate: 48000 };
  };
  const file = { size: 200 * MB, arrayBuffer: async () => (calls.read++, new ArrayBuffer(8)) };
  const out = await SV.media.extractAudio(file, 600, 615, { onProgress() {}, duration: 1200 });
  assert.equal(out.sampleRate, 48000);
  assert.deepEqual(seen, [[600, 615, "function"]]);
  assert.equal(calls.read + calls.decoded, 0, "no full read, no full decode");
});

test("extractAudio captures long videos even when the file is small", async () => {
  const calls = { decoded: 0, closed: 0, read: 0, captured: 0 };
  const SV = loadStickerVox(["src/media/audio.js"], { AudioContext: fakeDecodeCtx(4, 100, calls) });
  SV.media.captureAudio = async () => (calls.captured++, { channels: [new Float32Array(1)], sampleRate: 48000 });
  await SV.media.extractAudio({ size: 5 * MB, arrayBuffer: async () => new ArrayBuffer(8) }, 0, 1, { duration: 3600 });
  assert.deepEqual([calls.decoded, calls.captured], [0, 1]);
});
