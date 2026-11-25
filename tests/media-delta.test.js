// S13 (a): delta frames. Pure helpers in webp.js: diff bounding box, even-offset expansion,
// merge/keyframe decisions, the stateful planner and per-frame ANMF fields in the muxer.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { loadStickerVox } = require("./helpers/load.js");

const media = () => loadStickerVox(["src/media/webp.js"]).media;
const plain = (value) => JSON.parse(JSON.stringify(value));

// RGBA frame helpers.
function solid(w, h, rgba) {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) out.set(rgba, i * 4);
  return out;
}
function paint(frame, w, x0, y0, x1, y1, rgba) {
  const out = Uint8Array.from(frame);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.set(rgba, (y * w + x) * 4);
  return out;
}

// ---------- diffBounds ----------

test("diffBounds returns null when frames are identical or differ only below the threshold", () => {
  const m = media();
  const a = solid(32, 32, [100, 100, 100, 255]);
  assert.equal(m.diffBounds(a, a, 32, 32), null);
  const noisy = paint(a, 32, 0, 0, 32, 32, [104, 97, 103, 255]); // ±4 everywhere: codec noise
  assert.equal(m.diffBounds(a, noisy, 32, 32), null);
});

test("diffBounds covers the changed blocks and ignores an isolated noisy pixel", () => {
  const m = media();
  const a = solid(64, 64, [0, 0, 0, 255]);
  const moved = paint(a, 64, 20, 10, 30, 18, [255, 255, 255, 255]);
  const box = m.diffBounds(a, moved, 64, 64);
  // Block-aligned (8 px) box that contains the change.
  assert.deepEqual(plain(box), { x: 16, y: 8, width: 16, height: 16 });
  const speck = paint(a, 64, 50, 50, 51, 51, [255, 255, 255, 255]);
  assert.equal(m.diffBounds(a, speck, 64, 64), null, "one stray pixel is noise, not motion");
});

test("diffBounds sees alpha changes and clamps the last partial block to the frame", () => {
  const m = media();
  const a = solid(20, 20, [10, 10, 10, 255]);
  const cut = paint(a, 20, 17, 17, 20, 20, [10, 10, 10, 0]);
  assert.deepEqual(plain(m.diffBounds(a, cut, 20, 20)), { x: 16, y: 16, width: 4, height: 4 });
});

// ---------- expandRect ----------

test("expandRect grows by a margin, starts on even offsets and stays inside the canvas", () => {
  const m = media();
  assert.deepEqual(plain(m.expandRect({ x: 17, y: 9, width: 10, height: 5 }, 4, 512, 512)), { x: 12, y: 4, width: 19, height: 14 });
  assert.deepEqual(plain(m.expandRect({ x: 1, y: 0, width: 4, height: 4 }, 8, 512, 512)), { x: 0, y: 0, width: 13, height: 12 });
  assert.deepEqual(plain(m.expandRect({ x: 500, y: 505, width: 12, height: 7 }, 8, 512, 512)), { x: 492, y: 496, width: 20, height: 16 });
  for (const r of [{ x: 3, y: 7, width: 1, height: 1 }, { x: 255, y: 333, width: 30, height: 2 }]) {
    const e = m.expandRect(r, 3, 512, 512);
    assert.equal(e.x % 2, 0, "x offset is even (ANMF stores X / 2)");
    assert.equal(e.y % 2, 0, "y offset is even (ANMF stores Y / 2)");
    assert.ok(e.x <= r.x && e.y <= r.y && e.x + e.width >= r.x + r.width && e.y + e.height >= r.y + r.height, "contains the input");
  }
});

// ---------- deltaFrameKind: merge decision and keyframe cadence ----------

test("deltaFrameKind merges unchanged frames, keys the first frame and every keyIntervalMs", () => {
  const m = media();
  const opts = { width: 512, height: 512, keyIntervalMs: 1000, maxDeltaShare: 0.6 };
  const small = { x: 0, y: 0, width: 64, height: 64 };
  assert.equal(m.deltaFrameKind({ first: true, rect: null, sinceKeyMs: 0, ...opts }), "key");
  assert.equal(m.deltaFrameKind({ rect: null, sinceKeyMs: 400, ...opts }), "merge");
  assert.equal(m.deltaFrameKind({ rect: null, sinceKeyMs: 5000, ...opts }), "merge", "a still image needs no refresh");
  assert.equal(m.deltaFrameKind({ rect: small, sinceKeyMs: 933, ...opts }), "delta");
  assert.equal(m.deltaFrameKind({ rect: small, sinceKeyMs: 1000, ...opts }), "key", "periodic keyframe bounds lossy drift");
  const big = { x: 0, y: 0, width: 512, height: 320 }; // 62.5 % of the frame
  assert.equal(m.deltaFrameKind({ rect: big, sinceKeyMs: 66, ...opts }), "key", "a mostly-changed frame is sent whole");
});

// ---------- createDeltaPlanner ----------

test("createDeltaPlanner compares with what was last sent, so slow drift is eventually sent", () => {
  const m = media();
  const w = 32;
  const planner = m.createDeltaPlanner({ width: w, height: w, keyIntervalMs: 10000, margin: 0, threshold: 12 });
  const base = solid(w, w, [100, 100, 100, 255]);
  assert.equal(planner.push(base, 100).kind, "key");
  // +6 per frame on one block: each step is below the threshold, the sum is not.
  const step = (k) => paint(base, w, 8, 8, 16, 16, [100 + 6 * k, 100, 100, 255]);
  assert.equal(planner.push(step(1), 100).kind, "merge");
  assert.equal(planner.push(step(2), 100).kind, "merge");
  const d = planner.push(step(3), 100);
  assert.equal(d.kind, "delta");
  assert.deepEqual(plain(d.rect), { x: 8, y: 8, width: 8, height: 8 });
  assert.equal(planner.push(step(3), 100).kind, "merge", "the reference now holds the sent pixels");
});

test("createDeltaPlanner blends opaque sub-rects and replaces sub-rects that hold transparency", () => {
  const m = media();
  const w = 64;
  const planner = m.createDeltaPlanner({ width: w, height: w, keyIntervalMs: 10000, margin: 4 });
  // Circle-like sticker: transparent corner at the top-left 16×16 block.
  const base = paint(solid(w, w, [0, 0, 0, 255]), w, 0, 0, 16, 16, [0, 0, 0, 0]);
  const key = planner.push(base, 66);
  assert.equal(key.kind, "key");
  assert.equal(key.blend, false, "keyframes replace the whole canvas, as before");
  assert.deepEqual(plain(key.rect), { x: 0, y: 0, width: w, height: w });
  const inside = planner.push(paint(base, w, 40, 40, 48, 48, [255, 0, 0, 255]), 66);
  assert.equal(inside.kind, "delta");
  assert.equal(inside.blend, true, "fully opaque sub-rect: alpha blending on");
  assert.deepEqual(plain(inside.rect), { x: 36, y: 36, width: 16, height: 16 });
  const edge = planner.push(paint(base, w, 16, 16, 24, 24, [0, 255, 0, 255]), 66);
  assert.equal(edge.kind, "delta");
  assert.equal(edge.blend, false, "a sub-rect touching transparent pixels must not blend over the old ones");
  assert.equal(edge.rect.x % 2, 0);
});

test("createDeltaPlanner forces a keyframe once keyIntervalMs of shown time has passed", () => {
  const m = media();
  const w = 32;
  const planner = m.createDeltaPlanner({ width: w, height: w, keyIntervalMs: 300 });
  const base = solid(w, w, [0, 0, 0, 255]);
  const kinds = [planner.push(base, 100).kind];
  for (let k = 1; k <= 5; k++) kinds.push(planner.push(paint(base, w, 0, 0, 8, 8, [k * 40, 0, 0, 255]), 100).kind);
  assert.deepEqual(kinds, ["key", "delta", "delta", "key", "delta", "delta"]);
});

// ---------- muxAnimatedWebp per-frame fields ----------

const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0));
const u32le = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const u24le = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];
const u24at = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const u32at = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
function chunk(fourcc, payload) {
  const out = [...ascii(fourcc), ...u32le(payload.length), ...payload];
  if (payload.length % 2) out.push(0);
  return out;
}
const riffWebp = (chunks) => {
  const body = [...ascii("WEBP"), ...chunks.flat()];
  return Uint8Array.from([...ascii("RIFF"), ...u32le(body.length), ...body]);
};
const vp8Payload = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const simpleVp8 = () => riffWebp([chunk("VP8 ", vp8Payload)]);
const alphaStill = () =>
  riffWebp([chunk("VP8X", [0x10, 0, 0, 0, ...u24le(1), ...u24le(1)]), chunk("ALPH", [9, 9, 9]), chunk("VP8 ", vp8Payload)]);
function anmfHeaders(out) {
  const list = [];
  let o = 12;
  while (o + 8 <= out.length) {
    const id = String.fromCharCode(...out.slice(o, o + 4));
    const size = u32at(out, o + 4);
    if (id === "ANMF") {
      const p = out.subarray(o + 8);
      list.push({ x: u24at(p, 0) * 2, y: u24at(p, 3) * 2, width: u24at(p, 6) + 1, height: u24at(p, 9) + 1, ms: u24at(p, 12), flags: p[15] });
    }
    o += 8 + size + (size & 1);
  }
  return list;
}

test("muxAnimatedWebp output for full-frame stills is byte-for-byte what it was before S13", () => {
  const out = media().muxAnimatedWebp([simpleVp8(), alphaStill(), simpleVp8()], {
    width: 512,
    height: 512,
    frameDurationsMs: [67, 66, 67],
    loopCount: 0,
  });
  // Digest recorded from the pre-S13 muxer with this exact input.
  assert.equal(out.length, 188);
  assert.equal(crypto.createHash("sha256").update(out).digest("hex"), "5ddee44aaaccd16e5ad88037744bcb8b5e9b6af2af2aff46b7bb71c78ddd0f70");
  const explicit = media().muxAnimatedWebp([simpleVp8(), alphaStill(), simpleVp8()], {
    width: 512,
    height: 512,
    frameDurationsMs: [67, 66, 67],
    frames: [null, { x: 0, y: 0, width: 512, height: 512, blend: false, dispose: false }, {}],
  });
  assert.deepEqual(Array.from(explicit), Array.from(out), "explicit full-frame specs change nothing");
});

test("muxAnimatedWebp writes sub-frame offsets, sizes, blending and disposal per frame", () => {
  const out = media().muxAnimatedWebp([simpleVp8(), simpleVp8(), simpleVp8()], {
    width: 512,
    height: 512,
    frameDurationsMs: [200, 67, 133],
    frames: [
      { x: 0, y: 0, width: 512, height: 512, blend: false },
      { x: 36, y: 100, width: 81, height: 17, blend: true, dispose: false },
      { x: 2, y: 4, width: 10, height: 10, blend: false, dispose: true },
    ],
  });
  assert.deepEqual(anmfHeaders(out), [
    { x: 0, y: 0, width: 512, height: 512, ms: 200, flags: 0x02 },
    { x: 36, y: 100, width: 81, height: 17, ms: 67, flags: 0x00 },
    { x: 2, y: 4, width: 10, height: 10, ms: 133, flags: 0x03 },
  ]);
  const vp8x = out.subarray(20, 30);
  assert.equal(u24at(vp8x, 4) + 1, 512, "VP8X canvas stays 512 wide");
  assert.equal(u24at(vp8x, 7) + 1, 512, "VP8X canvas stays 512 high");
});

test("muxAnimatedWebp rejects odd offsets and sub-frames outside the canvas", () => {
  const m = media();
  const mux = (frame) => m.muxAnimatedWebp([simpleVp8()], { width: 64, height: 64, frameDurationsMs: [10], frames: [frame] });
  assert.throws(() => mux({ x: 3, y: 0, width: 8, height: 8 }), /even/);
  assert.throws(() => mux({ x: 0, y: 1, width: 8, height: 8 }), /even/);
  assert.throws(() => mux({ x: 60, y: 0, width: 8, height: 8 }), /canvas/);
  assert.throws(() => mux({ x: 0, y: 0, width: 0, height: 8 }), /canvas/);
});
