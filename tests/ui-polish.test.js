// Unit tests for the S12 pure helpers: filmstrip ruler layout, thumbnail slots, halftone
// build progress (samples, sweep, dot size, shimmer) and monotonic progress smoothing.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadStickerVox } = require("./helpers/load.js");

const M = loadStickerVox(["src/ui/model.js"]).uiModel;
const plain = (value) => JSON.parse(JSON.stringify(value));

// ---------- ruler ----------

function assertLabelsClean(layout, width, avoid, gap) {
  const labels = layout.labels;
  for (const label of labels) {
    assert.ok(label.left >= 0, `label ${label.text} starts inside the strip`);
    assert.ok(label.left + label.width <= width + 1e-9, `label ${label.text} ends inside the strip`);
    for (const zone of avoid) {
      const clear = label.left + label.width + gap <= zone.from || label.left >= zone.to + gap;
      assert.ok(clear, `label ${label.text} stays clear of the handle zone ${zone.from}-${zone.to}`);
    }
  }
  for (let i = 1; i < labels.length; i++) {
    assert.ok(labels[i].left >= labels[i - 1].left + labels[i - 1].width + gap, `${labels[i - 1].text} and ${labels[i].text} do not touch`);
  }
}

test("rulerLayout picks a readable step and labels ticks with clock times", () => {
  const layout = M.rulerLayout({ win: { start: 570, end: 645 }, width: 352 });
  const texts = layout.labels.map((label) => label.text);
  assert.ok(texts.length >= 3, "a 75 s window shows several labels");
  assert.ok(texts.includes("10:00"), "10:00 is a labeled tick");
  for (const text of texts) assert.match(text, /^\d+:\d\d$/, "labels are full clock times, never truncated");
  assert.ok(layout.ticks.some((tick) => !tick.major), "minor ticks subdivide the step");
  assert.ok(layout.ticks.every((tick) => tick.x >= 0 && tick.x <= 352), "ticks stay inside the strip");
  assertLabelsClean(layout, 352, [], layout.gap);
});

test("rulerLayout clamps the first and last labels inside the strip edges", () => {
  const layout = M.rulerLayout({ win: { start: 0, end: 10 }, width: 300 });
  const first = layout.labels[0];
  const last = layout.labels[layout.labels.length - 1];
  assert.equal(first.text, "0:00");
  assert.equal(first.left, 0, "the 0:00 label is pushed inward, not centered on the edge");
  assert.equal(last.text, "0:10");
  assert.ok(Math.abs(last.left + last.width - 300) < 1e-9, "the last label ends exactly at the right edge");
  assertLabelsClean(layout, 300, [], layout.gap);
});

test("rulerLayout drops labels that would sit under a trim handle", () => {
  // Selection 9:58–10:13 in a 75 s window: handles at the selection edges, 24 px each.
  const width = 352;
  const win = { start: 570, end: 645 };
  const px = (t) => ((t - win.start) / (win.end - win.start)) * width;
  const avoid = [
    { from: px(598) - 24, to: px(598) },
    { from: px(613), to: px(613) + 24 },
  ];
  const layout = M.rulerLayout({ win, width, avoid });
  assertLabelsClean(layout, width, avoid, layout.gap);
  assert.ok(layout.labels.length >= 2, "labels away from the handles survive");
  assert.ok(!layout.labels.some((label) => label.text === "10:00" && label.left < px(598) + 1), "nothing hides behind the start handle");
});

test("rulerLayout pins the selection's start and end times above the handles", () => {
  const width = 352;
  const win = { start: 570, end: 645 };
  const px = (t) => ((t - win.start) / (win.end - win.start)) * width;
  const pins = [
    { x: px(600) - 12, text: "10:00" },
    { x: px(615) + 12, text: "10:15" },
  ];
  const layout = M.rulerLayout({ win, width, pins });
  const pinned = layout.labels.filter((label) => label.pin);
  assert.deepEqual(plain(pinned.map((label) => label.text)), ["10:00", "10:15"], "both edges are labeled, in order");
  assertLabelsClean(layout, width, [], layout.gap);
  assert.ok(layout.labels.filter((label) => !label.pin).length >= 2, "regular labels still show around the pins");
  // Pins that would overlap are spread apart instead of dropped.
  const tight = M.rulerLayout({ win, width, pins: [{ x: 100, text: "10:00" }, { x: 110, text: "10:01" }] });
  assert.equal(tight.labels.filter((label) => label.pin).length, 2);
  assertLabelsClean(tight, width, [], tight.gap);
  // Pins at the strip edges are clamped inside.
  const edge = M.rulerLayout({ win: { start: 0, end: 8 }, width: 300, pins: [{ x: -12, text: "0.0 s" }, { x: 312, text: "8.0 s" }] });
  assertLabelsClean(edge, 300, [], edge.gap);
  assert.equal(edge.labels.filter((label) => label.pin).length, 2);
});

test("rulerLayout never lets labels collide, even on narrow strips and hour-long windows", () => {
  for (const [win, width] of [[{ start: 0, end: 7200 }, 180], [{ start: 3590, end: 3665 }, 200], [{ start: 0, end: 3.2 }, 120], [{ start: 0, end: 60 }, 352]]) {
    const layout = M.rulerLayout({ win, width });
    assertLabelsClean(layout, width, [], layout.gap);
    assert.ok(layout.labels.length >= 1, `at least one label for ${win.start}-${win.end}`);
  }
});

test("rulerLayout returns nothing for an empty window or no width", () => {
  assert.deepEqual(plain(M.rulerLayout({ win: { start: 5, end: 5 }, width: 300 })).labels, []);
  assert.deepEqual(plain(M.rulerLayout({ win: { start: 0, end: 10 }, width: 0 })).ticks, []);
  assert.deepEqual(plain(M.rulerLayout(null)).labels, []);
});

// ---------- thumbnails ----------

test("thumbSlots keeps thumbnails close to the video's own aspect ratio", () => {
  assert.equal(M.thumbSlots(352, 44, 1920, 1080), 4, "16:9 at 44 px tall: about 78 px per thumbnail");
  assert.equal(M.thumbSlots(352, 44, 720, 1280), 14, "portrait video: narrow thumbnails");
  assert.equal(M.thumbSlots(352, 44, 500, 500), 8, "square video");
  assert.equal(M.thumbSlots(352, 44, 4000, 500), 3, "never fewer than 3");
  assert.equal(M.thumbSlots(352, 44, 0, 0), 8, "unknown size falls back to 8");
});

// ---------- halftone ----------

function rgba(pixels) {
  return Uint8ClampedArray.from(pixels.flat());
}

test("halftoneSamples maps brightness to dot size (inverted on light surfaces) and keeps alpha", () => {
  const data = rgba([[255, 255, 255, 255], [0, 0, 0, 255], [128, 128, 128, 0], [255, 255, 255, 128]]);
  const dark = M.halftoneSamples(data, 2, true);
  assert.equal(dark.n, 2);
  assert.equal(dark.tone.length, 4);
  assert.ok(dark.tone[0] > 0.99 && dark.tone[1] < 0.01, "dark surface: white = big dot, black = small dot");
  assert.equal(dark.alpha[2], 0, "transparent pixel keeps no dot");
  assert.ok(Math.abs(dark.alpha[3] - 128 / 255) < 1e-6, "partial alpha is kept");
  const light = M.halftoneSamples(data, 2, false);
  assert.ok(light.tone[0] < 0.01 && light.tone[1] > 0.99, "light surface: black = big dot");
});

test("halftoneSamples stretches low-contrast frames so the picture still shows", () => {
  const data = rgba([[100, 100, 100, 255], [120, 120, 120, 255], [110, 110, 110, 255], [100, 100, 100, 255]]);
  const s = M.halftoneSamples(data, 2, true);
  assert.ok(s.tone[1] > 0.99 && s.tone[0] < 0.01, "the brightest opaque pixel maps to 1, the darkest to 0");
  const flat = M.halftoneSamples(rgba([[90, 90, 90, 255], [90, 90, 90, 255], [90, 90, 90, 255], [90, 90, 90, 255]]), 2, true);
  assert.ok(flat.tone.every((v) => v === flat.tone[0] && v > 0 && v < 1), "a flat frame gives an even mid-size grid");
});

test("halftoneSamples without data gives an even opaque grid", () => {
  const s = M.halftoneSamples(null, 3, true);
  assert.equal(s.tone.length, 9);
  assert.ok(s.alpha.every((a) => a === 1));
});

test("sweepReveal moves diagonally from top-left to bottom-right with a soft edge", () => {
  assert.equal(M.sweepReveal(0, 0, 0), 0, "nothing at 0 %");
  assert.equal(M.sweepReveal(1, 1, 1), 1, "everything at 100 %");
  assert.equal(M.sweepReveal(1, 0, 0), 1);
  const mid = 0.5;
  assert.ok(M.sweepReveal(mid, 0, 0) > M.sweepReveal(mid, 0.5, 0.5), "top-left leads");
  assert.ok(M.sweepReveal(mid, 0.5, 0.5) > M.sweepReveal(mid, 1, 1), "bottom-right trails");
  const a = M.sweepReveal(mid, 0.45, 0.45);
  assert.ok(a > 0 && a < 1, "the front is soft, not a hard line");
  let prev = -1;
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const v = M.sweepReveal(p, 0.7, 0.3);
    assert.ok(v >= prev, "a cell never un-reveals while progress grows");
    prev = v;
  }
});

test("the sweep spans only the opaque part of a shaped sticker", () => {
  // 4×4 grid, only the bottom-right 2×2 block is opaque.
  const px = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) px.push([255, 255, 255, i >= 2 && j >= 2 ? 255 : 0]);
  const s = M.halftoneSamples(rgba(px), 4, true);
  assert.ok(Math.abs(s.span.from - 0.625) < 1e-9 && Math.abs(s.span.to - 0.875) < 1e-9, "diagonal extent of the opaque cells");
  assert.deepEqual(plain(M.halftoneSamples(null, 4, true).span), { from: 0, to: 1 });
  // With that span, the first opaque cell starts revealing early instead of after half the bar.
  const u = 0.625;
  const early = M.sweepReveal(0.3, u, u, undefined, s.span);
  assert.ok(early > 0.3, "content starts filling early");
  assert.equal(M.sweepReveal(0.3, u, u), 0, "without the span the sweep would not have reached it yet");
  assert.equal(M.sweepReveal(1, 0.875, 0.875, undefined, s.span), 1);
  assert.equal(M.sweepReveal(0, 0.625, 0.625, undefined, s.span), 0);
});

test("halftoneDot grows with reveal and tone, and never draws transparent cells", () => {
  const seed = M.halftoneDot(0, 1, 1, 10);
  const full = M.halftoneDot(1, 1, 1, 10);
  const light = M.halftoneDot(1, 0, 1, 10);
  assert.ok(seed.r > 0 && seed.r < 3, "unrevealed cells show a small seed dot");
  assert.ok(Math.abs(full.r - 10) < 1e-9, "fully revealed, full tone = max radius");
  assert.ok(light.r > seed.r * 0.5 && light.r < full.r, "a low tone stays small but visible");
  assert.ok(full.a > seed.a, "revealed dots are more opaque");
  assert.equal(M.halftoneDot(1, 1, 0, 10).r, 0, "transparent areas have no dot");
  let prev = -1;
  for (let rv = 0; rv <= 1.0001; rv += 0.1) {
    const r = M.halftoneDot(rv, 0.6, 1, 10).r;
    assert.ok(r >= prev, "radius is monotonic in reveal");
    prev = r;
  }
});

test("shimmer is a small bounded wave that moves over time", () => {
  for (let t = 0; t < 3; t += 0.37) {
    const v = M.shimmer(0.3, 0.6, t);
    assert.ok(v >= 0 && v <= 1, "shimmer stays in 0..1");
  }
  assert.notEqual(M.shimmer(0.3, 0.6, 0), M.shimmer(0.3, 0.6, 0.5), "it moves with time");
});

// ---------- progress smoothing ----------

test("smoothProgress eases toward the target and never goes backwards", () => {
  let shown = 0;
  const targets = [0.1, 0.1, 0.3, 0.25, 0.25, 0.6, 0.4, 0.85, 0.85, 1];
  for (const target of targets) {
    for (let frame = 0; frame < 6; frame++) {
      const next = M.smoothProgress(shown, target, 33);
      assert.ok(next >= shown, `monotonic: ${next} >= ${shown}`);
      assert.ok(next <= 1, "never above 100 %");
      shown = next;
    }
  }
  const step = M.smoothProgress(0, 0.5, 33);
  assert.ok(step > 0 && step < 0.5, "one frame moves part of the way, no jump");
  let s = 0;
  for (let i = 0; i < 120; i++) s = M.smoothProgress(s, 0.5, 33);
  assert.ok(Math.abs(s - 0.5) < 1e-3, "it settles on the target");
});

test("smoothProgress creeps toward the phase ceiling while a phase is stalled, never past it", () => {
  let s = 0.85;
  for (let i = 0; i < 2000; i++) s = M.smoothProgress(s, 0.85, 33, { ceiling: 1 });
  assert.ok(s > 0.86, "a stalled phase still moves a little");
  assert.ok(s < 0.95, "creeping never reaches the end of the phase");
  const done = M.smoothProgress(0.9, 1, 33, { fast: true });
  assert.ok(done - 0.9 > M.smoothProgress(0.9, 1, 33) - 0.9, "finishing eases faster");
  assert.equal(M.smoothProgress(0.4, NaN, 33), 0.4, "a bad target keeps the value");
});

test("progressCeiling returns where the current phase ends on the overall bar", () => {
  assert.equal(M.progressCeiling({ phase: "frames" }), 0.6);
  assert.equal(M.progressCeiling({ phase: "webp" }), 0.85);
  assert.equal(M.progressCeiling({ phase: "audio", realtime: true }), 1);
  assert.equal(M.progressCeiling({ phase: "frames", realtime: true }), 0.35);
  assert.equal(M.progressCeiling(null), null);
});

test("rulerLayout accepts a label format (seconds for short videos)", () => {
  const layout = M.rulerLayout({ win: { start: 0, end: 6 }, width: 320, format: (t) => `${t} s` });
  assert.ok(layout.labels.length >= 2);
  for (const label of layout.labels) assert.match(label.text, /^\d+ s$/);
  assertLabelsClean(layout, 320, [], layout.gap);
});

// ---------- halftone frame: fixed grid, soft front, smooth content (user feedback on S12) ----------

function stepEdgeImage(n) {
  // Left half black, right half white, fully opaque: the hardest content edge.
  const px = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) px.push(i < n / 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]);
  return rgba(px);
}
function maxAdjacentDiff(dots, n) {
  let worst = 0;
  for (let j = 0; j < n; j++) for (let i = 1; i < n; i++) worst = Math.max(worst, Math.abs(dots[j * n + i].r - dots[j * n + i - 1].r));
  return worst;
}

test("halftoneFrame keeps dot centers on a constant grid pitch, whatever the progress", () => {
  const n = 8;
  const s = M.halftoneSamples(stepEdgeImage(n), n, true);
  const a = M.halftoneFrame(s, 0.2, 160);
  const b = M.halftoneFrame(s, 0.9, 160, { time: 1.3 });
  assert.equal(a.dots.length, n * n);
  assert.equal(a.maxR, b.maxR);
  for (let k = 0; k < n * n; k++) {
    assert.equal(a.dots[k].x, b.dots[k].x, "x does not depend on progress or time");
    assert.equal(a.dots[k].y, b.dots[k].y, "y does not depend on progress or time");
  }
  for (let j = 0; j < n; j++) for (let i = 1; i < n; i++) {
    assert.ok(Math.abs(a.dots[j * n + i].x - a.dots[j * n + i - 1].x - 20) < 1e-9, "constant pitch along a row");
    assert.equal(a.dots[j * n + i].y, a.dots[j * n].y, "rows are straight");
  }
});

test("halftoneFrame radius is continuous across the sweep front at any progress", () => {
  const n = 32;
  const flat = M.halftoneSamples(null, n, true);
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const f = M.halftoneFrame(flat, p, 320);
    assert.ok(maxAdjacentDiff(f.dots, n) <= 0.1 * f.maxR, `soft front at ${p.toFixed(2)}: ${maxAdjacentDiff(f.dots, n) / f.maxR}`);
  }
});

test("content modulates the radius smoothly, without a step between adjacent columns", () => {
  const n = 32;
  for (const dark of [true, false]) {
    const s = M.halftoneSamples(stepEdgeImage(n), n, dark);
    for (const p of [0.5, 0.85, 0.93, 1]) {
      const f = M.halftoneFrame(s, p, 320);
      assert.ok(maxAdjacentDiff(f.dots, n) <= 0.25 * f.maxR, `hard edge softened at ${p}: ${maxAdjacentDiff(f.dots, n) / f.maxR}`);
    }
    const full = M.halftoneFrame(s, 1, 320);
    const row = full.dots.slice(0, n).map((d) => d.r);
    assert.ok(Math.abs(row[0] - row[n - 1]) > 0.3 * full.maxR, "the picture still reads: both sides stay clearly different");
  }
});

test("halftoneFrame in reduced motion fills evenly with progress and has no shimmer", () => {
  const n = 8;
  const s = M.halftoneSamples(null, n, true);
  const f = M.halftoneFrame(s, 0.5, 160, { reduce: true, time: 2 });
  const rs = f.dots.map((d) => d.r);
  assert.ok(rs.every((r) => Math.abs(r - rs[0]) < 1e-9), "every dot is the same size");
  const g = M.halftoneFrame(s, 0.5, 160, { reduce: true, time: 0 });
  assert.deepEqual(plain(f.dots), plain(g.dots), "time changes nothing");
});
