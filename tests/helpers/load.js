// Loads MAIN-world classic scripts into a fresh VM context and returns its StickerVox namespace.
// Only pure helpers are expected to work here; DOM/WebCodecs-dependent functions are not exercised.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..", "..");

function loadStickerVox(files, extraGlobals = {}) {
  const context = vm.createContext({ console, Uint8Array, Float32Array, DataView, Math, ...extraGlobals });
  for (const file of ["src/core.js", ...files]) {
    const code = fs.readFileSync(path.join(ROOT, file), "utf8");
    vm.runInContext(code, context, { filename: file });
  }
  return context.StickerVox;
}

module.exports = { loadStickerVox, ROOT };
