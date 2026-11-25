// Unit tests for the pure panel model (StickerVox.uiModel).
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadStickerVox } = require("./helpers/load.js");

const M = loadStickerVox(["src/ui/model.js"]).uiModel;
// Objects come from another VM realm; compare as plain JSON values.
const plain = (value) => JSON.parse(JSON.stringify(value));
const close = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}: ${actual} != ${expected}`);

function assertInside(crop, w, h) {
  assert.ok(crop.x >= 0 && crop.y >= 0, "crop starts inside the frame");
  assert.ok(crop.x + crop.size <= w + 1e-9, "crop right edge inside the frame");
  assert.ok(crop.y + crop.size <= h + 1e-9, "crop bottom edge inside the frame");
}

test("defaultCrop returns the largest centered square", () => {
  assert.deepEqual(plain(M.defaultCrop(1920, 1080)), { x: 420, y: 0, size: 1080 });
  assert.deepEqual(plain(M.defaultCrop(720, 1280)), { x: 0, y: 280, size: 720 });
  assert.deepEqual(plain(M.defaultCrop(500, 500)), { x: 0, y: 0, size: 500 });
});

test("clampCrop keeps the crop inside the frame and within size limits", () => {
  assert.deepEqual(plain(M.clampCrop({ x: -50, y: -10, size: 400 }, 1920, 1080)), { x: 0, y: 0, size: 400 });
  assert.deepEqual(plain(M.clampCrop({ x: 1800, y: 900, size: 400 }, 1920, 1080)), { x: 1520, y: 680, size: 400 });
  const tooBig = M.clampCrop({ x: 0, y: 0, size: 5000 }, 1920, 1080);
  assert.equal(tooBig.size, 1080);
  assertInside(tooBig, 1920, 1080);
  const tooSmall = M.clampCrop({ x: 10, y: 10, size: 5 }, 1920, 1080);
  close(tooSmall.size, 1080 * 0.15, "min size is 15% of the short side");
});

test("clampCrop falls back to the default crop for invalid input", () => {
  assert.deepEqual(plain(M.clampCrop(null, 1920, 1080)), { x: 420, y: 0, size: 1080 });
  assert.deepEqual(plain(M.clampCrop({ x: NaN, y: 0, size: 100 }, 1920, 1080)), { x: 420, y: 0, size: 1080 });
});

test("zoomCrop keeps the anchor point fixed when zooming in", () => {
  const crop = { x: 420, y: 0, size: 1080 };
  const anchorX = 700;
  const anchorY = 300;
  const zoomed = M.zoomCrop(crop, 2, anchorX, anchorY, 1920, 1080);
  close(zoomed.size, 540, "zoom 2x halves the size");
  // Relative anchor position inside the crop is unchanged.
  close((anchorX - zoomed.x) / zoomed.size, (anchorX - crop.x) / crop.size, "anchor u");
  close((anchorY - zoomed.y) / zoomed.size, (anchorY - crop.y) / crop.size, "anchor v");
  assertInside(zoomed, 1920, 1080);
});

test("zoomCrop defaults the anchor to the crop center", () => {
  const zoomed = M.zoomCrop({ x: 420, y: 0, size: 1080 }, 2, undefined, undefined, 1920, 1080);
  assert.deepEqual(plain(zoomed), { x: 690, y: 270, size: 540 });
});

test("zoomCrop respects the minimum and maximum size", () => {
  const minSize = 1080 * 0.15;
  const deep = M.zoomCrop({ x: 420, y: 0, size: 1080 }, 100, 960, 540, 1920, 1080);
  close(deep.size, minSize, "min size");
  assertInside(deep, 1920, 1080);
  const out = M.zoomCrop({ x: 800, y: 300, size: 200 }, 0.01, 900, 400, 1920, 1080);
  assert.equal(out.size, 1080);
  assertInside(out, 1920, 1080);
});

test("zoomCrop near the edge never leaves the frame", () => {
  const zoomed = M.zoomCrop({ x: 1720, y: 880, size: 200 }, 0.5, 1919, 1079, 1920, 1080);
  assert.equal(zoomed.size, 400);
  assertInside(zoomed, 1920, 1080);
});

test("panCrop moves the crop and stops at the frame edges", () => {
  assert.deepEqual(plain(M.panCrop({ x: 100, y: 100, size: 400 }, 50, -30, 1920, 1080)), { x: 150, y: 70, size: 400 });
  assert.deepEqual(plain(M.panCrop({ x: 100, y: 100, size: 400 }, -500, 5000, 1920, 1080)), { x: 0, y: 680, size: 400 });
  assert.deepEqual(plain(M.panCrop({ x: 420, y: 0, size: 1080 }, 0, 50, 1920, 1080)), { x: 420, y: 0, size: 1080 });
});

test("clampRange keeps a valid range unchanged", () => {
  assert.deepEqual(plain(M.clampRange(2, 4.5, 30, 5)), { start: 2, end: 4.5 });
});

test("clampRange limits the length to maxClipSec", () => {
  assert.deepEqual(plain(M.clampRange(10, 20, 30, 5)), { start: 10, end: 15 });
});

test("clampRange limits the range to the video duration", () => {
  assert.deepEqual(plain(M.clampRange(-3, 2, 30, 5)), { start: 0, end: 2 });
  assert.deepEqual(plain(M.clampRange(28, 40, 30, 5)), { start: 28, end: 30 });
  assert.deepEqual(plain(M.clampRange(0, 10, 3, 5)), { start: 0, end: 3 });
});

test("clampRange repairs empty or inverted ranges", () => {
  assert.deepEqual(plain(M.clampRange(4, 4, 30, 5)), { start: 4, end: 9 });
  assert.deepEqual(plain(M.clampRange(6, 2, 30, 5)), { start: 6, end: 11 });
  assert.deepEqual(plain(M.clampRange(30, 30, 30, 5)), { start: 25, end: 30 });
  assert.deepEqual(plain(M.clampRange(NaN, NaN, 30, 5)), { start: 0, end: 5 });
});

test("normalizeCues trims text and drops empty cues", () => {
  const cues = M.normalizeCues(
    [
      { text: "  hola  ", start: 0, end: 1, position: "bottom" },
      { text: "   ", start: 0, end: 1, position: "top" },
      { text: "", start: 1, end: 2, position: "top" },
      { start: 1, end: 2 },
    ],
    5,
  );
  assert.deepEqual(plain(cues), [{ text: "hola", start: 0, end: 1, position: "bottom" }]);
});

test("normalizeCues clamps times to the clip and sorts by start", () => {
  const cues = M.normalizeCues(
    [
      { text: "b", start: 3, end: 9, position: "top" },
      { text: "a", start: -1, end: 2, position: "bottom" },
    ],
    5,
  );
  assert.deepEqual(plain(cues), [
    { text: "a", start: 0, end: 2, position: "bottom" },
    { text: "b", start: 3, end: 5, position: "top" },
  ]);
});

test("normalizeCues ensures start < end", () => {
  const cues = M.normalizeCues(
    [
      { text: "swap", start: 3, end: 1, position: "bottom" },
      { text: "same", start: 2, end: 2, position: "bottom" },
      { text: "atEnd", start: 5, end: 7, position: "bottom" },
    ],
    5,
  );
  for (const cue of cues) assert.ok(cue.start < cue.end, `${cue.text}: ${cue.start} < ${cue.end}`);
  assert.deepEqual(plain(cues.find((c) => c.text === "swap")), { text: "swap", start: 1, end: 3, position: "bottom" });
  assert.equal(cues.length, 3);
  assert.ok(cues.every((c) => c.start >= 0 && c.end <= 5));
});

test("normalizeCues defaults unknown positions to bottom and handles bad input", () => {
  const cues = M.normalizeCues([{ text: "x", start: 0, end: 1, position: "middle" }], 5);
  assert.equal(cues[0].position, "bottom");
  assert.deepEqual(plain(M.normalizeCues(null, 5)), []);
  assert.deepEqual(plain(M.normalizeCues([{ text: "x", start: 0, end: 0 }], 0)), []);
});

// ---------- wizard helpers (T6) ----------

test("moveTrimHandle moves the start handle and snaps to 0.1 s", () => {
  assert.deepEqual(plain(M.moveTrimHandle({ start: 1, end: 3 }, "start", 2, 30, 5)), { start: 2, end: 3 });
  assert.deepEqual(plain(M.moveTrimHandle({ start: 1, end: 3 }, "start", 1.234, 30, 5)), { start: 1.2, end: 3 });
  assert.deepEqual(plain(M.moveTrimHandle({ start: 1, end: 3 }, "start", -5, 30, 5)), { start: 0, end: 3 });
});

test("moveTrimHandle pushes the other handle instead of crossing it", () => {
  assert.deepEqual(plain(M.moveTrimHandle({ start: 1, end: 3 }, "start", 3.5, 30, 5)), { start: 3.5, end: 3.6 });
  assert.deepEqual(plain(M.moveTrimHandle({ start: 2, end: 3 }, "end", 1, 30, 5)), { start: 0.9, end: 1 });
});

test("moveTrimHandle drags the other handle along to keep the max length", () => {
  assert.deepEqual(plain(M.moveTrimHandle({ start: 4, end: 8 }, "start", 1, 30, 5)), { start: 1, end: 6 });
  assert.deepEqual(plain(M.moveTrimHandle({ start: 1, end: 3 }, "end", 9, 30, 5)), { start: 4, end: 9 });
});

test("moveTrimHandle stays inside the video", () => {
  assert.deepEqual(plain(M.moveTrimHandle({ start: 26, end: 29 }, "end", 40, 30, 5)), { start: 26, end: 30 });
  assert.deepEqual(plain(M.moveTrimHandle({ start: 1, end: 2 }, "start", 31, 30, 5)), { start: 29.9, end: 30 });
  const short = M.moveTrimHandle({ start: 0, end: 2 }, "end", 7, 2.5, 5);
  assert.deepEqual(plain(short), { start: 0, end: 2.5 });
});

test("timeToRatio maps a time to the 0..1 timeline position", () => {
  assert.equal(M.timeToRatio(5, 20), 0.25);
  assert.equal(M.timeToRatio(-1, 20), 0);
  assert.equal(M.timeToRatio(30, 20), 1);
  assert.equal(M.timeToRatio(3, 0), 0);
});

test("cueAtPlayhead starts at the playhead and lasts 1.5 s inside the clip", () => {
  assert.deepEqual(plain(M.cueAtPlayhead(0.2, 4)), { start: 0.2, end: 1.7 });
  assert.deepEqual(plain(M.cueAtPlayhead(0.34, 4)), { start: 0.3, end: 1.8 });
  assert.deepEqual(plain(M.cueAtPlayhead(2, 2.7)), { start: 2, end: 2.7 });
  assert.deepEqual(plain(M.cueAtPlayhead(2.7, 2.7)), { start: 2.6, end: 2.7 });
  assert.deepEqual(plain(M.cueAtPlayhead(NaN, 3)), { start: 0, end: 1.5 });
});

test("setCueEdge sets the start or end from the playhead", () => {
  assert.deepEqual(plain(M.setCueEdge({ start: 0.2, end: 1 }, "end", 1.8, 2.7)), { start: 0.2, end: 1.8 });
  assert.deepEqual(plain(M.setCueEdge({ start: 0.2, end: 1 }, "start", 0.5, 2.7)), { start: 0.5, end: 1 });
});

test("setCueEdge repairs a cue when the new edge crosses the other one", () => {
  assert.deepEqual(plain(M.setCueEdge({ start: 0.2, end: 1 }, "start", 1.4, 2.7)), { start: 1.4, end: 2.7 });
  assert.deepEqual(plain(M.setCueEdge({ start: 1, end: 2 }, "end", 0.5, 2.7)), { start: 0, end: 0.5 });
  assert.deepEqual(plain(M.setCueEdge({ start: 1, end: 2 }, "start", 2.7, 2.7)), { start: 2.6, end: 2.7 });
});

test("initials takes the first letters of the first two words", () => {
  assert.equal(M.initials("Ana María"), "AM");
  assert.equal(M.initials("mamá"), "M");
  assert.equal(M.initials("  (Familia)   García López "), "FG");
  assert.equal(M.initials("Ñandú 2024"), "Ñ");
  assert.equal(M.initials("+57 300 1234567"), "");
  assert.equal(M.initials(null), "");
});

test("avatarHue is a stable hue from the name", () => {
  const hue = M.avatarHue("Ana María");
  assert.equal(M.avatarHue("Ana María"), hue);
  assert.ok(Number.isInteger(hue) && hue >= 0 && hue < 360);
  assert.notEqual(M.avatarHue("Ana"), M.avatarHue("Luis"));
  assert.ok(M.avatarHue(undefined) >= 0);
});

const CHATS = [
  { id: "a", name: "Mamá", isGroup: false, active: false },
  { id: "self", name: "Tú (mensajes a ti)", isGroup: false, isSelf: true, active: false },
  { id: "g", name: "Familia García", isGroup: true, active: true },
];

test("orderChats pins the self chat first and filters ignoring accents and case", () => {
  assert.deepEqual(plain(M.orderChats(CHATS, "")).map((c) => c.id), ["self", "a", "g"]);
  assert.deepEqual(plain(M.orderChats(CHATS, "mama")).map((c) => c.id), ["a"]);
  assert.deepEqual(plain(M.orderChats(CHATS, "  GARC ")).map((c) => c.id), ["g"]);
  assert.deepEqual(plain(M.orderChats(CHATS, "zzz")), []);
  assert.deepEqual(plain(M.orderChats(null, "")), []);
});

test("pickChatId keeps the current chat, else the active one, else the self chat", () => {
  assert.equal(M.pickChatId(CHATS, "a"), "a");
  assert.equal(M.pickChatId(CHATS, "gone"), "g");
  assert.equal(M.pickChatId(CHATS.map((c) => ({ ...c, active: false })), null), "self");
  assert.equal(M.pickChatId([{ id: "x", name: "X" }], null), null);
  assert.equal(M.pickChatId([], "a"), null);
});

test("buildProgress maps pipeline phases to a label and overall ratio", () => {
  assert.deepEqual(plain(M.buildProgress({ phase: "frames", ratio: 0.5 })), { label: "Preparando cuadros…", ratio: 0.3 });
  assert.deepEqual(plain(M.buildProgress({ phase: "webp", ratio: 1 })), { label: "Comprimiendo…", ratio: 0.85 });
  assert.deepEqual(plain(M.buildProgress({ phase: "audio", ratio: 1 })), { label: "Preparando audio…", ratio: 1 });
  assert.deepEqual(plain(M.buildProgress({ phase: "audio", ratio: 7 })), { label: "Preparando audio…", ratio: 1 });
  assert.deepEqual(plain(M.buildProgress({ phase: "other" })), { label: "Creando sticker…", ratio: null });
  assert.deepEqual(plain(M.buildProgress(null)), { label: "Creando sticker…", ratio: null });
});

test("sendViewState picks the step-3 state from flags", () => {
  assert.equal(M.sendViewState({ building: true }), "building");
  assert.equal(M.sendViewState({ buildError: "x" }), "error");
  assert.equal(M.sendViewState({ result: true, waReady: false }), "waiting");
  assert.equal(M.sendViewState({ result: true, waReady: true }), "ready");
  assert.equal(M.sendViewState({ result: true, waReady: true, sending: true }), "sending");
  assert.equal(M.sendViewState({ result: true, waReady: true, sendError: "x" }), "error");
  assert.equal(M.sendViewState({ result: true, waReady: true, sent: true }), "success");
  assert.equal(M.sendViewState({}), "building");
});

test("clampStep keeps the wizard on step 1 until a video is loaded", () => {
  assert.equal(M.clampStep(3, false), 1);
  assert.equal(M.clampStep(2, true), 2);
  assert.equal(M.clampStep(9, true), 3);
  assert.equal(M.clampStep(0, true), 1);
  assert.equal(M.clampStep(NaN, true), 1);
});

// ---------- S11: long videos (filmstrip zoom + overview) ----------
test("filmWindow keeps the whole video for videos up to 60 s", () => {
  assert.deepEqual(plain(M.filmWindow({ start: 10, end: 20 }, 60)), { start: 0, end: 60 });
  assert.deepEqual(plain(M.filmWindow({ start: 0, end: 3 }, 8)), { start: 0, end: 8 });
  assert.deepEqual(plain(M.filmWindow({ start: 0, end: 0 }, 0)), { start: 0, end: 0 });
});

test("filmWindow zooms around the selection in long videos, clamped to the video", () => {
  // 15 s selection: ±30 s around it.
  assert.deepEqual(plain(M.filmWindow({ start: 600, end: 615 }, 1200)), { start: 570, end: 645 });
  // Short selection: at least ±10 s.
  assert.deepEqual(plain(M.filmWindow({ start: 100, end: 102 }, 1200)), { start: 90, end: 112 });
  // Near the edges the window keeps its width and slides inside the video.
  assert.deepEqual(plain(M.filmWindow({ start: 5, end: 20 }, 1200)), { start: 0, end: 75 });
  assert.deepEqual(plain(M.filmWindow({ start: 1190, end: 1200 }, 1200)), { start: 1150, end: 1200 });
  // Never wider than the video.
  assert.deepEqual(plain(M.filmWindow({ start: 30, end: 45 }, 70)), { start: 0, end: 70 });
});

test("windowRatio and windowTime map between time and track position inside the window", () => {
  const win = { start: 570, end: 645 };
  assert.equal(M.windowRatio(570, win), 0);
  assert.equal(M.windowRatio(607.5, win), 0.5);
  assert.equal(M.windowRatio(10, win), 0);
  assert.equal(M.windowRatio(2000, win), 1);
  assert.equal(M.windowTime(0.5, win), 607.5);
  assert.equal(M.windowTime(-1, win), 570);
  assert.equal(M.windowTime(2, win), 645);
  // Whole-video window: same as timeToRatio (previous behavior).
  assert.equal(M.windowRatio(5, { start: 0, end: 20 }), M.timeToRatio(5, 20));
  assert.equal(M.windowRatio(5, { start: 3, end: 3 }), 0);
});

test("needsRefocus asks for a new window when the selection reaches its edges", () => {
  const win = { start: 570, end: 645 };
  assert.equal(M.needsRefocus(win, { start: 600, end: 615 }, 1200), false);
  assert.equal(M.needsRefocus(win, { start: 630, end: 645 }, 1200), true, "touches the right edge");
  assert.equal(M.needsRefocus(win, { start: 570, end: 580 }, 1200), true, "touches the left edge");
  assert.equal(M.needsRefocus(win, { start: 700, end: 715 }, 1200), true, "outside");
  assert.equal(M.needsRefocus({ start: 0, end: 75 }, { start: 0, end: 15 }, 1200), false, "edge of the video is fine");
  assert.equal(M.needsRefocus({ start: 1125, end: 1200 }, { start: 1185, end: 1200 }, 1200), false);
  assert.equal(M.needsRefocus({ start: 0, end: 30 }, { start: 20, end: 30 }, 30), false, "short video never refocuses");
  assert.equal(M.needsRefocus(null, { start: 0, end: 1 }, 30), true);
});

test("placeRange and shiftRange move the selection keeping its length inside the video", () => {
  assert.deepEqual(plain(M.placeRange({ start: 600, end: 615 }, 100, 1200)), { start: 100, end: 115 });
  assert.deepEqual(plain(M.placeRange({ start: 600, end: 615 }, 100.04, 1200)), { start: 100, end: 115 }, "snaps to 0.1 s");
  assert.deepEqual(plain(M.placeRange({ start: 600, end: 615 }, -50, 1200)), { start: 0, end: 15 });
  assert.deepEqual(plain(M.placeRange({ start: 600, end: 615 }, 1199, 1200)), { start: 1185, end: 1200 });
  assert.deepEqual(plain(M.placeRange({ start: 1, end: 3.3 }, 5, 1200)), { start: 5, end: 7.3 });
  assert.deepEqual(plain(M.shiftRange({ start: 600, end: 615 }, 10, 1200)), { start: 610, end: 625 });
  assert.deepEqual(plain(M.shiftRange({ start: 600, end: 615 }, -1, 1200)), { start: 599, end: 614 });
  assert.deepEqual(plain(M.shiftRange({ start: 1180, end: 1195 }, 10, 1200)), { start: 1185, end: 1200 });
});

test("overviewGrab keeps the grab point when dragging the selection, centers it otherwise", () => {
  const range = { start: 600, end: 615 };
  assert.equal(M.overviewGrab(range, 605), 5, "grabbed inside the selection");
  assert.equal(M.overviewGrab(range, 100), 7.5, "clicked elsewhere: the selection centers on the pointer");
  assert.deepEqual(plain(M.placeRange(range, 100 - M.overviewGrab(range, 100), 1200)), { start: 92.5, end: 107.5 });
});

test("fmtClock formats video positions as m:ss or h:mm:ss", () => {
  assert.equal(M.fmtClock(0), "0:00");
  assert.equal(M.fmtClock(5.9), "0:05");
  assert.equal(M.fmtClock(600), "10:00");
  assert.equal(M.fmtClock(3599), "59:59");
  assert.equal(M.fmtClock(3600), "1:00:00");
  assert.equal(M.fmtClock(3725), "1:02:05");
  assert.equal(M.fmtClock(NaN), "0:00");
});

test("buildProgress shows the real-time recording position and re-weights the phases", () => {
  assert.deepEqual(plain(M.buildProgress({ phase: "audio", ratio: 0.38, realtime: true, recordedSec: 6.2, totalSec: 15 })), {
    label: "Grabando el audio del fragmento… 6 / 15 s",
    ratio: 0.659,
  });
  assert.equal(M.buildProgress({ phase: "audio", ratio: 0, recordedSec: 0, totalSec: 12.4 }).label, "Grabando el audio del fragmento… 0 / 12.4 s");
  assert.equal(M.buildProgress({ phase: "audio", ratio: 1, recordedSec: 16, totalSec: 15 }).label, "Grabando el audio del fragmento… 15 / 15 s");
  assert.deepEqual(plain(M.buildProgress({ phase: "frames", ratio: 1, realtime: true })), { label: "Preparando cuadros…", ratio: 0.35 });
  assert.deepEqual(plain(M.buildProgress({ phase: "audio", ratio: 1, realtime: true })), { label: "Preparando audio…", ratio: 1 });
});
