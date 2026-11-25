// StickerVox core (MAIN world): creates the namespace shared by every other script.
(function (root) {
  if (root.StickerVox) return;

  function log(level, event, data) {
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    console[method]("[StickerVox]", event, data === undefined ? "" : data);
  }

  root.StickerVox = { version: "0.1.0", log };
})(globalThis);
