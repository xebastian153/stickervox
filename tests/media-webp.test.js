const test = require("node:test");
const assert = require("node:assert/strict");
const { loadStickerVox } = require("./helpers/load.js");

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
function riffWebp(chunks) {
  const body = [...ascii("WEBP"), ...chunks.flat()];
  return Uint8Array.from([...ascii("RIFF"), ...u32le(body.length), ...body]);
}
function parseChunks(bytes, start, end) {
  const list = [];
  let o = start;
  while (o + 8 <= end) {
    const fourcc = String.fromCharCode(...bytes.slice(o, o + 4));
    const size = u32at(bytes, o + 4);
    list.push({ fourcc, size, offset: o, payload: bytes.slice(o + 8, o + 8 + size) });
    o += 8 + size + (size % 2);
  }
  assert.equal(o, end, "chunks must tile the container exactly");
  return list;
}

const vp8Payload = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // odd length on purpose
const simpleVp8 = () => riffWebp([chunk("VP8 ", vp8Payload)]);
const alphaStill = () =>
  riffWebp([
    chunk("VP8X", [0x10, 0, 0, 0, ...u24le(1), ...u24le(1)]),
    chunk("ALPH", [9, 9, 9]),
    chunk("VP8 ", vp8Payload),
  ]);
// VP8L header: signature 0x2f, then 14 bits width-1, 14 bits height-1, 1 bit alpha, 3 bits version.
function vp8lStill(alpha) {
  const bits = 1 | (1 << 14) | ((alpha ? 1 : 0) << 28);
  return riffWebp([chunk("VP8L", [0x2f, ...u32le(bits), 7, 7])]);
}

const media = () => loadStickerVox(["src/media/webp.js"]).media;

test("muxAnimatedWebp writes a RIFF/WEBP container with VP8X, ANIM and one ANMF per frame", () => {
  const out = media().muxAnimatedWebp([simpleVp8(), simpleVp8(), simpleVp8()], {
    width: 512,
    height: 512,
    frameDurationsMs: [67, 66, 67],
    loopCount: 0,
  });
  assert.equal(String.fromCharCode(...out.slice(0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...out.slice(8, 12)), "WEBP");
  assert.equal(u32at(out, 4), out.length - 8, "RIFF size field");
  assert.equal(out.length % 2, 0);

  const chunks = parseChunks(out, 12, out.length);
  assert.deepEqual(chunks.map((c) => c.fourcc), ["VP8X", "ANIM", "ANMF", "ANMF", "ANMF"]);

  const vp8x = chunks[0].payload;
  assert.equal(chunks[0].size, 10);
  assert.equal(vp8x[0] & 0x02, 0x02, "animation flag");
  assert.equal(vp8x[0] & 0x10, 0, "no alpha flag for opaque frames");
  assert.equal(u24at(vp8x, 4), 511);
  assert.equal(u24at(vp8x, 7), 511);

  const anim = chunks[1].payload;
  assert.equal(chunks[1].size, 6);
  assert.equal(u32at(anim, 0), 0, "background colour");
  assert.equal(anim[4] | (anim[5] << 8), 0, "loop count");

  const durations = [];
  for (const anmf of chunks.slice(2)) {
    const p = anmf.payload;
    assert.equal(u24at(p, 0), 0);
    assert.equal(u24at(p, 3), 0);
    assert.equal(u24at(p, 6), 511);
    assert.equal(u24at(p, 9), 511);
    durations.push(u24at(p, 12));
    assert.equal(p[15], 0x02, "no blending, no dispose");
    const inner = parseChunks(p, 16, p.length);
    assert.deepEqual(inner.map((c) => c.fourcc), ["VP8 "]);
    assert.deepEqual(Array.from(inner[0].payload), vp8Payload);
  }
  assert.deepEqual(durations, [67, 66, 67]);
});

test("muxAnimatedWebp keeps ALPH+VP8 from VP8X stills and sets the alpha flag", () => {
  const out = media().muxAnimatedWebp([alphaStill(), simpleVp8()], {
    width: 100,
    height: 60,
    frameDurationsMs: [100, 100],
    loopCount: 3,
  });
  const chunks = parseChunks(out, 12, out.length);
  assert.equal(chunks[0].payload[0] & 0x12, 0x12, "animation + alpha flags");
  assert.equal(u24at(chunks[0].payload, 4), 99);
  assert.equal(u24at(chunks[0].payload, 7), 59);
  assert.equal(chunks[1].payload[4] | (chunks[1].payload[5] << 8), 3, "loop count");
  const first = parseChunks(chunks[2].payload, 16, chunks[2].payload.length);
  assert.deepEqual(first.map((c) => c.fourcc), ["ALPH", "VP8 "]);
  assert.deepEqual(Array.from(first[0].payload), [9, 9, 9]);
  assert.equal(u24at(chunks[2].payload, 6), 99);
  assert.equal(u24at(chunks[2].payload, 9), 59);
});

test("muxAnimatedWebp accepts VP8L stills and reads their alpha bit", () => {
  const opaque = media().muxAnimatedWebp([vp8lStill(false)], { width: 2, height: 2, frameDurationsMs: [50] });
  const c1 = parseChunks(opaque, 12, opaque.length);
  assert.equal(c1[0].payload[0] & 0x10, 0);
  assert.deepEqual(parseChunks(c1[2].payload, 16, c1[2].payload.length).map((c) => c.fourcc), ["VP8L"]);

  const withAlpha = media().muxAnimatedWebp([vp8lStill(true)], { width: 2, height: 2, frameDurationsMs: [50] });
  assert.equal(parseChunks(withAlpha, 12, withAlpha.length)[0].payload[0] & 0x10, 0x10);
});

test("muxAnimatedWebp rejects bad input", () => {
  const m = media();
  assert.throws(() => m.muxAnimatedWebp([], { width: 1, height: 1, frameDurationsMs: [] }));
  assert.throws(() => m.muxAnimatedWebp([Uint8Array.from([1, 2, 3])], { width: 1, height: 1, frameDurationsMs: [10] }));
  assert.throws(() => m.muxAnimatedWebp([simpleVp8()], { width: 1, height: 1, frameDurationsMs: [] }));
});
