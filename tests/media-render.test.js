const test = require("node:test");
const assert = require("node:assert/strict");
const { loadStickerVox } = require("./helpers/load.js");

const media = () => loadStickerVox(["src/media/render.js"]).media;

test("activeCaptions returns cues with start <= t < end", () => {
  const caps = [
    { text: "a", start: 0, end: 1, position: "bottom" },
    { text: "b", start: 1, end: 2, position: "top" },
    { text: "c", start: 0.5, end: 3, position: "bottom" },
  ];
  const at = (t) => Array.from(media().activeCaptions(caps, t), (c) => c.text);
  assert.deepEqual(at(0), ["a"]);
  assert.deepEqual(at(0.5), ["a", "c"]);
  assert.deepEqual(at(1), ["b", "c"], "end is exclusive, start inclusive");
  assert.deepEqual(at(2.99), ["c"]);
  assert.deepEqual(at(3), []);
  assert.deepEqual(at(-0.1), []);
});

test("activeCaptions tolerates missing input", () => {
  assert.deepEqual(Array.from(media().activeCaptions(undefined, 1)), []);
});

// ---------- drawFrame with a recording 2D context ----------

// Records every call with a copy of the context state; measureText width = 0.5 em per character.
function recordingCtx() {
  const calls = [];
  const props = { font: "10px sans-serif", fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, textBaseline: "alphabetic", textAlign: "start" };
  const fontPx = () => Number((/(\d+(?:\.\d+)?)px/.exec(props.font) || [0, 10])[1]);
  return new Proxy(
    {},
    {
      get(_, key) {
        if (key === "calls") return calls;
        if (key === "measureText") return (text) => ({ width: String(text).length * fontPx() * 0.5 });
        if (key in props) return props[key];
        return (...args) => calls.push({ fn: key, args, state: { ...props } });
      },
      set(_, key, value) {
        props[key] = value;
        return true;
      },
    },
  );
}
const SOURCE = { tag: "video" };
const CROP = { x: 10, y: 20, size: 300 };
const callsOf = (ctx, fn) => ctx.calls.filter((c) => c.fn === fn);
const measure = (text, font) => String(text).length * Number(/(\d+)px/.exec(font)[1]) * 0.5;
const textLayer = (props) => ({ id: 1, type: "text", text: "Hola", x: 0.5, y: 0.5, scale: 0.1, style: "meme", color: "#ffffff", start: 0, end: 5, ...props });

test("drawFrame keeps the legacy caption layout (black square, bottom and top blocks)", () => {
  const ctx = recordingCtx();
  const captions = [
    { text: "Hola", start: 0, end: 2, position: "bottom" },
    { text: "Arriba", start: 0, end: 2, position: "top" },
  ];
  media().drawFrame(ctx, SOURCE, CROP, captions, 1, 512);
  const names = ctx.calls.map((c) => c.fn);
  assert.ok(!names.includes("clearRect"), "square output stays opaque");
  assert.ok(!names.includes("clip"), "square output is not clipped");
  const fill = ctx.calls.find((c) => c.fn === "fillRect");
  assert.deepEqual(fill.args, [0, 0, 512, 512]);
  assert.equal(fill.state.fillStyle, "#000");
  assert.deepEqual(ctx.calls.find((c) => c.fn === "drawImage").args, [SOURCE, 10, 20, 300, 300, 0, 0, 512, 512]);
  const fills = callsOf(ctx, "fillText");
  assert.equal(fills.length, 2);
  const margin = 512 * 0.055;
  assert.deepEqual(fills[0].args, ["Hola", 256, 512 - margin]);
  assert.equal(fills[0].state.textBaseline, "bottom");
  assert.equal(fills[0].state.font, 'bold 64px Impact, "Arial Black", sans-serif');
  assert.equal(fills[0].state.fillStyle, "#fff");
  assert.equal(fills[0].state.strokeStyle, "#000");
  assert.deepEqual(fills[1].args, ["Arriba", 256, margin]);
  assert.equal(fills[1].state.textBaseline, "top");
  assert.equal(callsOf(ctx, "strokeText").length, 2, "outline drawn under each line");
});

test("drawFrame hides captions outside their time window", () => {
  const ctx = recordingCtx();
  media().drawFrame(ctx, SOURCE, CROP, [{ text: "x", start: 1, end: 2, position: "bottom" }], 0.5, 512);
  assert.equal(callsOf(ctx, "fillText").length, 0);
});

test("drawFrame draws text and emoji layers centered on their position, in z-order", () => {
  const ctx = recordingCtx();
  const layers = [textLayer({ id: 1, text: "uno", x: 0.25, y: 0.75 }), textLayer({ id: 2, type: "emoji", text: "🔥", x: 0.5, y: 0.25, scale: 0.3 })];
  media().drawFrame(ctx, SOURCE, CROP, layers, 1, 400);
  const fills = callsOf(ctx, "fillText");
  assert.deepEqual(fills.map((c) => c.args[0]), ["uno", "🔥"]);
  assert.deepEqual(fills[0].args.slice(1), [100, 300]);
  assert.equal(fills[0].state.textBaseline, "middle");
  assert.equal(fills[0].state.textAlign, "center");
  assert.equal(callsOf(ctx, "strokeText").length, 1, "meme text has an outline, emoji does not");
  assert.equal(fills[1].args[1], 200);
  assert.match(fills[1].state.font, /^120px .*Emoji/, "emoji uses the system emoji font at scale * size");
});

test("drawFrame skips layers outside their time window", () => {
  const ctx = recordingCtx();
  media().drawFrame(ctx, SOURCE, CROP, [textLayer({ start: 2, end: 3 })], 1, 400);
  assert.equal(callsOf(ctx, "fillText").length, 0);
});

test("drawFrame paints the bubble style as a pill behind contrasting ink", () => {
  const ctx = recordingCtx();
  media().drawFrame(ctx, SOURCE, CROP, [textLayer({ style: "bubble", color: "#ffffff" })], 1, 400);
  const pill = callsOf(ctx, "fill").pop();
  assert.equal(pill.state.fillStyle, "#ffffff");
  const text = callsOf(ctx, "fillText")[0];
  assert.equal(text.state.fillStyle, "#111b21");
  assert.equal(callsOf(ctx, "strokeText").length, 0);
});

test("drawFrame with a circle shape clears to transparent and clips to the circle", () => {
  const ctx = recordingCtx();
  media().drawFrame(ctx, SOURCE, CROP, [], 0, 512, { shape: "circle", outline: false });
  const names = ctx.calls.map((c) => c.fn);
  assert.deepEqual(ctx.calls.find((c) => c.fn === "clearRect").args, [0, 0, 512, 512]);
  assert.deepEqual(ctx.calls.find((c) => c.fn === "arc").args.slice(0, 3), [256, 256, 256]);
  assert.ok(names.indexOf("clip") > -1 && names.indexOf("clip") < names.indexOf("drawImage"), "video is clipped to the shape");
});

test("drawFrame with an outline paints a white shape and insets the video", () => {
  const ctx = recordingCtx();
  const m = media();
  m.drawFrame(ctx, SOURCE, CROP, [], 0, 512, { shape: "circle", outline: true });
  const arcs = callsOf(ctx, "arc");
  assert.equal(arcs[0].args[2], 256, "outer white circle");
  assert.ok(Math.abs(arcs[1].args[2] - (256 - m.SHAPE_BORDER_RATIO * 512)) < 1e-9, "video circle inset by the border");
  assert.equal(callsOf(ctx, "fill")[0].state.fillStyle, "#ffffff");
});

test("drawFrame defaults to the opaque square when options are missing or unknown", () => {
  for (const options of [undefined, {}, { shape: "star" }]) {
    const ctx = recordingCtx();
    media().drawFrame(ctx, SOURCE, CROP, [], 0, 512, options);
    assert.ok(!ctx.calls.some((c) => c.fn === "clearRect" || c.fn === "clip"));
  }
});

test("shapeGeometry returns rect, rounded rect and circle math with insets", () => {
  const m = media();
  assert.deepEqual(JSON.parse(JSON.stringify(m.shapeGeometry("square", 512, 0))), { kind: "rect", x: 0, y: 0, w: 512, h: 512, r: 0 });
  const rounded = m.shapeGeometry("rounded", 512, 10);
  assert.equal(rounded.kind, "rect");
  assert.equal(rounded.x, 10);
  assert.equal(rounded.w, 492);
  assert.ok(Math.abs(rounded.r - (512 * m.ROUND_RATIO - 10)) < 1e-9, "nested radius = outer radius - inset");
  assert.deepEqual(JSON.parse(JSON.stringify(m.shapeGeometry("circle", 400, 20))), { kind: "circle", cx: 200, cy: 200, r: 180 });
  assert.equal(m.shapeGeometry("hexagon", 100, 0).kind, "rect", "unknown shapes fall back to square");
  assert.equal(m.shapeGeometry("hexagon", 100, 0).r, 0);
  assert.equal(m.shapeGeometry("rounded", 100, 80).r, 0, "radius never negative");
});

test("layoutText sizes the font from scale and shrinks long text to fit", () => {
  const m = media();
  const short = m.layoutText(measure, textLayer({ text: "Hola", scale: 0.1 }), 500);
  assert.equal(short.fontSize, 50);
  assert.deepEqual(Array.from(short.lines), ["Hola"]);
  assert.ok(Math.abs(short.w - 100 - 2 * short.padX) < 1e-9, "box width = text + padding");
  assert.equal(short.cx, 250);
  const long = m.layoutText(measure, textLayer({ text: "x".repeat(60), scale: 0.1 }), 500);
  assert.ok(long.w <= 500 * 0.92 + 1e-9, "long text fits inside 92% of the square");
  assert.ok(long.fontSize < 50);
  const two = m.layoutText(measure, textLayer({ text: "a\nb", scale: 0.1 }), 500);
  assert.equal(two.lines.length, 2);
  assert.ok(two.h > short.h, "two lines are taller");
});

test("layoutText adds box padding for bubble and label styles and sizes emoji from scale", () => {
  const m = media();
  const meme = m.layoutText(measure, textLayer({ style: "meme" }), 500);
  const bubble = m.layoutText(measure, textLayer({ style: "bubble" }), 500);
  const label = m.layoutText(measure, textLayer({ style: "label" }), 500);
  assert.ok(bubble.padX > meme.padX && bubble.padY > meme.padY);
  assert.ok(label.padX > meme.padX);
  const emoji = m.layoutText(measure, textLayer({ type: "emoji", text: "😀", scale: 0.2 }), 500);
  assert.equal(emoji.fontSize, 100);
});

test("layoutText gives empty text a placeholder-sized box", () => {
  const box = media().layoutText(measure, textLayer({ text: "" }), 500);
  assert.ok(box.w > 0 && box.h > 0);
  assert.equal(box.lines.length, 0);
});

test("inkFor picks dark ink on light colors and white ink on dark colors", () => {
  const m = media();
  assert.equal(m.inkFor("#ffffff"), "#111b21");
  assert.equal(m.inkFor("#ffd60a"), "#111b21");
  assert.equal(m.inkFor("#000000"), "#ffffff");
  assert.equal(m.inkFor("#008069"), "#ffffff");
  assert.equal(m.inkFor("nonsense"), "#111b21", "invalid colors count as white");
});
