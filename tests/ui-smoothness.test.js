// S13 (b): label of the smoothness estimate shown next to the clip duration.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadStickerVox } = require("./helpers/load.js");

const M = loadStickerVox(["src/ui/model.js"]).uiModel;
const plain = (value) => JSON.parse(JSON.stringify(value));
const fits = (fps, quality = 0.35) => ({ chosen: { fps, quality, bytes: 1 }, suggestedSec: null });

test("smoothnessLabel maps the predicted frame rate to a word, a bar count and a spoken text", () => {
  assert.deepEqual(plain(M.smoothnessLabel(fits(15))), {
    level: "great",
    bars: 4,
    text: "≈ 15 cuadros/s · muy fluido",
    spoken: "Fluidez estimada: unos 15 cuadros por segundo, muy fluido.",
  });
  const short = (fps) => {
    const l = M.smoothnessLabel(fits(fps));
    return [l.level, l.bars, l.text];
  };
  assert.deepEqual(short(12), ["good", 3, "≈ 12 cuadros/s · fluido"]);
  assert.deepEqual(short(10), ["good", 3, "≈ 10 cuadros/s · fluido"]);
  assert.deepEqual(short(8), ["ok", 2, "≈ 8 cuadros/s · aceptable"]);
  assert.deepEqual(short(6), ["low", 1, "≈ 6 cuadros/s · entrecortado"]);
  assert.deepEqual(short(5), ["low", 1, "≈ 5 cuadros/s · entrecortado"]);
});

test("smoothnessLabel says how long a clip that does not fit should be, with a decimal comma", () => {
  assert.deepEqual(plain(M.smoothnessLabel({ chosen: null, suggestedSec: 9.5 })), {
    level: "none",
    bars: 0,
    text: "No cabe · acorta a ~9,5 s",
    spoken: "No cabe en el límite de tamaño. Acórtalo a unos 9,5 segundos.",
  });
  assert.equal(M.smoothnessLabel({ chosen: null, suggestedSec: 4 }).text, "No cabe · acorta a ~4 s");
});

test("smoothnessLabel shows a pending state without a spoken text while calculating", () => {
  for (const pending of [null, undefined]) {
    assert.deepEqual(plain(M.smoothnessLabel(pending)), { level: "pending", bars: 0, text: "Calculando…", spoken: "" });
  }
});
