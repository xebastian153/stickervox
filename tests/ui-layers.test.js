// Unit tests for the canvas-first layer model (StickerVox.uiModel, S10).
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadStickerVox } = require("./helpers/load.js");

const M = loadStickerVox(["src/ui/model.js"]).uiModel;
const plain = (value) => JSON.parse(JSON.stringify(value));
const close = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}: ${actual} != ${expected}`);

// ---------- create / clamp / move / resize ----------

test("createLayer fills text defaults and spans the whole clip", () => {
  const layer = plain(M.createLayer("text", { text: "Hola" }, 7, 3.2));
  assert.equal(layer.id, 7);
  assert.equal(layer.type, "text");
  assert.equal(layer.text, "Hola");
  assert.equal(layer.style, "meme");
  assert.equal(layer.color, "#ffffff");
  assert.equal(layer.x, 0.5);
  assert.ok(layer.y > 0.7 && layer.y < 0.95, "new text sits at the center-bottom");
  assert.equal(layer.start, 0);
  assert.equal(layer.end, 3.2);
  assert.ok(layer.scale >= M.LAYER_LIMITS.text.min && layer.scale <= M.LAYER_LIMITS.text.max);
});

test("createLayer for emoji uses emoji defaults and keeps given props", () => {
  const layer = plain(M.createLayer("emoji", { text: "😂", x: 0.3 }, 2, 5));
  assert.equal(layer.type, "emoji");
  assert.equal(layer.text, "😂");
  assert.equal(layer.x, 0.3);
  assert.equal(layer.scale, M.LAYER_LIMITS.emoji.def);
  assert.equal(layer.end, 5);
});

test("createLayer falls back to text for unknown types and style for unknown styles", () => {
  const layer = plain(M.createLayer("sticker", { style: "neon" }, 1, 2));
  assert.equal(layer.type, "text");
  assert.equal(layer.style, "meme");
});

test("clampLayer keeps the whole box inside the square", () => {
  const box = { w: 0.4, h: 0.2 };
  const left = M.clampLayer({ ...M.createLayer("text", {}, 1, 1), x: -1, y: -1 }, box);
  close(left.x, 0.2, "left edge");
  close(left.y, 0.1, "top edge");
  const right = M.clampLayer({ ...M.createLayer("text", {}, 1, 1), x: 2, y: 2 }, box);
  close(right.x, 0.8, "right edge");
  close(right.y, 0.9, "bottom edge");
  const inside = M.clampLayer({ ...M.createLayer("text", {}, 1, 1), x: 0.5, y: 0.6 }, box);
  close(inside.x, 0.5, "inside x unchanged");
  close(inside.y, 0.6, "inside y unchanged");
});

test("clampLayer centers a box wider than the square and treats a missing box as a point", () => {
  const wide = M.clampLayer({ ...M.createLayer("text", {}, 1, 1), x: 0.1 }, { w: 1.3, h: 0.2 });
  close(wide.x, 0.5, "too wide is centered");
  const point = M.clampLayer({ ...M.createLayer("text", {}, 1, 1), x: 1.4, y: NaN });
  close(point.x, 1, "point clamps to 0..1");
  close(point.y, 0.5, "invalid y falls back to the center");
});

test("moveLayer moves by a normalized delta and stays inside", () => {
  const layer = { ...M.createLayer("emoji", { text: "🔥" }, 1, 1), x: 0.5, y: 0.5 };
  const moved = M.moveLayer(layer, 0.1, -0.2, { w: 0.2, h: 0.2 });
  close(moved.x, 0.6, "x");
  close(moved.y, 0.3, "y");
  const stopped = M.moveLayer(layer, 0.9, 0.9, { w: 0.2, h: 0.2 });
  close(stopped.x, 0.9, "x stops at the edge");
  close(stopped.y, 0.9, "y stops at the edge");
  assert.equal(layer.x, 0.5, "the input layer is not mutated");
});

test("resizeLayer scales and respects min and max per type", () => {
  const text = M.createLayer("text", {}, 1, 1);
  close(M.resizeLayer(text, 1.5).scale, text.scale * 1.5, "grows");
  close(M.resizeLayer(text, 100).scale, M.LAYER_LIMITS.text.max, "max");
  close(M.resizeLayer(text, 0.001).scale, M.LAYER_LIMITS.text.min, "min");
  const emoji = M.createLayer("emoji", { text: "😎" }, 2, 1);
  close(M.resizeLayer(emoji, 100).scale, M.LAYER_LIMITS.emoji.max, "emoji max");
  close(M.resizeLayer(emoji, 0).scale, emoji.scale, "invalid factor keeps the size");
});

test("resizeLayer re-clamps the position with the scaled box", () => {
  const layer = { ...M.createLayer("emoji", { text: "😎" }, 1, 1), x: 0.9, y: 0.5 };
  // box 0.2 wide at the current scale; doubling makes it 0.4, so the center must move to 0.8.
  const bigger = M.resizeLayer(layer, 2, { w: 0.2, h: 0.2 });
  close(bigger.x, 0.8, "pushed back inside");
});

// ---------- hit test / z-order ----------

test("hitTest returns the topmost box under the point", () => {
  const boxes = [
    { id: 1, x: 0.5, y: 0.5, w: 0.6, h: 0.6 },
    { id: 2, x: 0.6, y: 0.6, w: 0.2, h: 0.2 },
  ];
  assert.equal(M.hitTest(boxes, 0.62, 0.62), 2, "later box is on top");
  assert.equal(M.hitTest(boxes, 0.3, 0.3), 1);
  assert.equal(M.hitTest(boxes, 0.95, 0.05), null, "miss");
  assert.equal(M.hitTest(boxes, 0.95, 0.5, 0.2), 1, "padding widens the target");
  assert.equal(M.hitTest(null, 0.5, 0.5), null);
});

test("bringToFront moves one layer to the end without touching the others", () => {
  const layers = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(plain(M.bringToFront(layers, 1)).map((l) => l.id), [2, 3, 1]);
  assert.deepEqual(plain(M.bringToFront(layers, 3)).map((l) => l.id), [1, 2, 3]);
  assert.deepEqual(plain(M.bringToFront(layers, 9)).map((l) => l.id), [1, 2, 3], "unknown id");
  assert.deepEqual(layers.map((l) => l.id), [1, 2, 3], "input not mutated");
});

// ---------- timing tracks ----------

test("dragTrack moves the start edge, snaps and keeps start < end", () => {
  const t = { start: 1, end: 2 };
  assert.deepEqual(plain(M.dragTrack(t, "start", 0.33, 4)), { start: 1.3, end: 2 });
  assert.deepEqual(plain(M.dragTrack(t, "start", 5, 4)), { start: 1.9, end: 2 }, "stops 0.1 s before the end");
  assert.deepEqual(plain(M.dragTrack(t, "start", -5, 4)), { start: 0, end: 2 }, "clamps to the clip start");
});

test("dragTrack moves the end edge inside the clip", () => {
  const t = { start: 1, end: 2 };
  assert.deepEqual(plain(M.dragTrack(t, "end", 1, 4)), { start: 1, end: 3 });
  assert.deepEqual(plain(M.dragTrack(t, "end", 9, 4)), { start: 1, end: 4 }, "clamps to the clip end");
  assert.deepEqual(plain(M.dragTrack(t, "end", -9, 4)), { start: 1, end: 1.1 }, "stops 0.1 s after the start");
});

test("dragTrack slides the whole bar keeping its length inside the clip", () => {
  const t = { start: 1, end: 2 };
  assert.deepEqual(plain(M.dragTrack(t, "body", 0.5, 4)), { start: 1.5, end: 2.5 });
  assert.deepEqual(plain(M.dragTrack(t, "body", 9, 4)), { start: 3, end: 4 });
  assert.deepEqual(plain(M.dragTrack(t, "body", -9, 4)), { start: 0, end: 1 });
});

test("dragTrack repairs bad input", () => {
  assert.deepEqual(plain(M.dragTrack({ start: 3, end: 1 }, "body", 0, 4)), { start: 1, end: 3 }, "inverted");
  assert.deepEqual(plain(M.dragTrack(null, "end", 0, 2)), { start: 0, end: 2 }, "missing times span the clip");
});

test("refitLayerTimes keeps whole-clip layers whole and clamps the rest", () => {
  const layers = [
    { id: 1, start: 0, end: 4 },
    { id: 2, start: 1, end: 3.5 },
    { id: 3, start: 2.5, end: 3 },
  ];
  const out = plain(M.refitLayerTimes(layers, 4, 2));
  assert.deepEqual(out.map((l) => [l.start, l.end]), [[0, 2], [1, 2], [1.9, 2]]);
  const longer = plain(M.refitLayerTimes(layers, 4, 5));
  assert.deepEqual(longer.map((l) => [l.start, l.end]), [[0, 5], [1, 3.5], [2.5, 3]]);
});

// ---------- caption migration / normalization ----------

test("captionToLayer maps bottom and top captions to centered meme text", () => {
  const bottom = plain(M.captionToLayer({ text: "Hola", start: 0.5, end: 2, position: "bottom" }, 4));
  assert.equal(bottom.type, "text");
  assert.equal(bottom.id, 4);
  assert.equal(bottom.text, "Hola");
  assert.equal(bottom.x, 0.5);
  close(bottom.y, 0.88, "bottom y");
  assert.equal(bottom.style, "meme");
  assert.equal(bottom.start, 0.5);
  assert.equal(bottom.end, 2);
  close(M.captionToLayer({ text: "a", start: 0, end: 1, position: "top" }, 1).y, 0.12, "top y");
  close(M.captionToLayer({ text: "a", start: 0, end: 1, position: "middle" }, 1).y, 0.88, "unknown -> bottom");
});

test("normalizeLayers migrates captions, drops empty text and repairs times without reordering", () => {
  const out = plain(
    M.normalizeLayers(
      [
        { id: 5, type: "emoji", text: "🔥", x: 0.5, y: 0.5, scale: 0.3, style: "meme", color: "#fff", start: 1, end: 9 },
        { text: "  legacy  ", start: 0, end: 1, position: "top" },
        { id: 6, type: "text", text: "   ", x: 0.5, y: 0.5, scale: 0.1, start: 0, end: 1 },
        { id: 7, type: "text", text: "b", x: 0.5, y: 0.5, scale: 0.1, start: 2, end: 2 },
        null,
      ],
      3,
    ),
  );
  assert.deepEqual(out.map((l) => l.text), ["🔥", "legacy", "b"], "z-order kept, empty dropped");
  assert.equal(out[0].end, 3, "end clamped to clip");
  assert.equal(out[1].type, "text");
  close(out[1].y, 0.12, "migrated top caption");
  assert.ok(out[2].end > out[2].start, "zero-length repaired");
  assert.deepEqual(plain(M.normalizeLayers(undefined, 3)), []);
});

// ---------- history ----------

test("history pushes, undoes and redoes snapshots", () => {
  let h = M.createHistory({ v: 0 });
  assert.equal(M.canUndo(h), false);
  h = M.pushHistory(h, { v: 1 });
  h = M.pushHistory(h, { v: 2 });
  assert.deepEqual(plain(h.present), { v: 2 });
  h = M.undoHistory(h);
  assert.deepEqual(plain(h.present), { v: 1 });
  assert.equal(M.canRedo(h), true);
  h = M.redoHistory(h);
  assert.deepEqual(plain(h.present), { v: 2 });
  assert.equal(M.canRedo(h), false);
  assert.deepEqual(plain(M.redoHistory(h).present), { v: 2 }, "redo at the end is a no-op");
  assert.deepEqual(plain(M.undoHistory(M.createHistory({ v: 0 })).present), { v: 0 }, "undo at the start is a no-op");
});

test("a new edit after undo clears redo", () => {
  let h = M.createHistory({ v: 0 });
  h = M.pushHistory(h, { v: 1 });
  h = M.undoHistory(h);
  h = M.pushHistory(h, { v: 9 });
  assert.equal(M.canRedo(h), false);
  assert.deepEqual(plain(h.present), { v: 9 });
  assert.deepEqual(plain(M.undoHistory(h).present), { v: 0 });
});

test("history is bounded and skips unchanged snapshots", () => {
  let h = M.createHistory({ v: 0 }, 3);
  for (let i = 1; i <= 10; i++) h = M.pushHistory(h, { v: i });
  assert.equal(h.past.length, 3, "only the last 3 undo steps are kept");
  h = M.pushHistory(h, { v: 10 });
  assert.equal(h.past.length, 3, "same snapshot is not pushed");
  for (let i = 0; i < 10; i++) h = M.undoHistory(h);
  assert.deepEqual(plain(h.present), { v: 7 });
  assert.equal(M.createHistory({}).limit, 50, "default limit is 50");
});

test("history coalesces bursts with the same key inside the window", () => {
  let h = M.createHistory({ v: 0 });
  h = M.pushHistory(h, { v: 1 }, "type:1", 1000);
  h = M.pushHistory(h, { v: 2 }, "type:1", 1400);
  h = M.pushHistory(h, { v: 3 }, "type:1", 1700);
  assert.equal(h.past.length, 1, "one undo step for the burst");
  h = M.pushHistory(h, { v: 4 }, "type:1", 5000);
  assert.equal(h.past.length, 2, "a pause starts a new step");
  h = M.pushHistory(h, { v: 5 }, "move:1", 5100);
  assert.equal(h.past.length, 3, "a different key starts a new step");
  assert.deepEqual(plain(M.undoHistory(M.undoHistory(M.undoHistory(h))).present), { v: 0 });
});
