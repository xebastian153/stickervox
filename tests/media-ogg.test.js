const test = require("node:test");
const assert = require("node:assert/strict");
const { loadStickerVox } = require("./helpers/load.js");

// Independent Ogg CRC-32: polynomial 0x04C11DB7, non-reflected, init 0, no final xor (bit by bit).
function oggCrc(bytes) {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 24;
    for (let k = 0; k < 8; k++) crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
    crc >>>= 0;
  }
  return crc >>> 0;
}
const u32at = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

function parsePages(bytes) {
  const pages = [];
  let o = 0;
  while (o < bytes.length) {
    assert.equal(String.fromCharCode(...bytes.slice(o, o + 4)), "OggS", "capture pattern at " + o);
    assert.equal(bytes[o + 4], 0, "stream structure version");
    const nseg = bytes[o + 26];
    const lacing = Array.from(bytes.slice(o + 27, o + 27 + nseg));
    const bodyLen = lacing.reduce((a, b) => a + b, 0);
    const end = o + 27 + nseg + bodyLen;
    const zeroed = bytes.slice(o, end);
    zeroed.fill(0, 22, 26);
    const packets = [];
    let cur = [];
    let p = o + 27 + nseg;
    for (const l of lacing) {
      cur.push(...bytes.slice(p, p + l));
      p += l;
      if (l < 255) {
        packets.push(Uint8Array.from(cur));
        cur = [];
      }
    }
    pages.push({
      flags: bytes[o + 5],
      granule: new DataView(bytes.buffer, bytes.byteOffset + o + 6, 8).getBigInt64(0, true),
      serial: u32at(bytes, o + 14),
      seq: u32at(bytes, o + 18),
      crc: u32at(bytes, o + 22),
      expectedCrc: oggCrc(zeroed),
      packets,
      openTail: cur.length,
    });
    o = end;
  }
  return pages;
}

const media = () => loadStickerVox(["src/media/ogg.js"]).media;
const packet = (len, fill) => ({ data: new Uint8Array(len).fill(fill), samples48k: 960 });

test("muxOggOpus writes OpusHead, OpusTags and audio pages with valid headers and CRCs", () => {
  const packets = Array.from({ length: 120 }, (_, i) => packet(10 + (i % 7), i & 255));
  const out = media().muxOggOpus(packets, { channels: 2, preSkip: 312, inputSampleRate: 44100 });
  const pages = parsePages(out);

  assert.ok(pages.length >= 4, "head, tags and at least two audio pages");
  for (const p of pages) assert.equal(p.crc, p.expectedCrc, "page CRC");
  for (const p of pages) assert.equal(p.openTail, 0, "no packet spans pages");
  pages.forEach((p, i) => assert.equal(p.seq, i, "sequence number"));
  assert.ok(pages.every((p) => p.serial === pages[0].serial), "single serial");

  assert.equal(pages[0].flags, 0x02, "BOS only on first page");
  assert.ok(pages.slice(1).every((p) => (p.flags & 0x02) === 0));
  assert.equal(pages.at(-1).flags & 0x04, 0x04, "EOS on last page");
  assert.ok(pages.slice(0, -1).every((p) => (p.flags & 0x04) === 0));

  const head = pages[0].packets[0];
  assert.equal(pages[0].packets.length, 1);
  assert.equal(pages[0].granule, 0n);
  assert.equal(String.fromCharCode(...head.slice(0, 8)), "OpusHead");
  assert.equal(head.length, 19);
  assert.equal(head[8], 1, "version");
  assert.equal(head[9], 2, "channels");
  assert.equal(head[10] | (head[11] << 8), 312, "pre-skip");
  assert.equal(u32at(head, 12), 44100, "input sample rate");
  assert.equal(head[16] | (head[17] << 8), 0, "output gain");
  assert.equal(head[18], 0, "mapping family");

  const tags = pages[1].packets[0];
  assert.equal(pages[1].packets.length, 1);
  assert.equal(pages[1].granule, 0n);
  assert.equal(String.fromCharCode(...tags.slice(0, 8)), "OpusTags");
  const vlen = u32at(tags, 8);
  assert.equal(String.fromCharCode(...tags.slice(12, 12 + vlen)), "StickerVox");
  assert.equal(u32at(tags, 12 + vlen), 0, "no user comments");

  let cumulative = 0n;
  const audio = [];
  for (const p of pages.slice(2)) {
    cumulative += BigInt(p.packets.length * 960);
    assert.equal(p.granule, cumulative, "granule = samples completed so far");
    audio.push(...p.packets);
  }
  assert.equal(audio.length, packets.length);
  audio.forEach((a, i) => assert.deepEqual(a, packets[i].data));
});

test("muxOggOpus laces packets of 255 bytes and longer correctly", () => {
  const packets = [packet(255, 1), packet(600, 2), packet(3, 3)];
  const out = media().muxOggOpus(packets, { channels: 1, preSkip: 312, inputSampleRate: 48000 });
  const pages = parsePages(out);
  for (const p of pages) assert.equal(p.crc, p.expectedCrc);
  const audio = pages.slice(2).flatMap((p) => p.packets);
  assert.equal(audio.length, 3);
  audio.forEach((a, i) => assert.deepEqual(a, packets[i].data));
  assert.equal(pages[0].packets[0][9], 1, "mono");
});

test("muxOggOpus trims the final granule to preSkip + input length when given", () => {
  const packets = Array.from({ length: 10 }, (_, i) => packet(8, i));
  const out = media().muxOggOpus(packets, {
    channels: 1,
    preSkip: 312,
    inputSampleRate: 48000,
    inputLength48k: 9000,
  });
  const pages = parsePages(out);
  assert.equal(pages.at(-1).granule, 312n + 9000n);
});

test("muxOggOpus rejects an empty packet list", () => {
  assert.throws(() => media().muxOggOpus([], { channels: 1, preSkip: 312, inputSampleRate: 48000 }));
});
