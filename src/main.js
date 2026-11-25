// StickerVox boot (MAIN world): mounts the panel and reacts to the toolbar button.
(function (root) {
  const SV = root.StickerVox;
  if (!SV || SV.started) return;
  SV.started = true;

  try {
    SV.ui.mount();
  } catch (error) {
    SV.log("error", "ui:mount-failed", error);
  }

  root.addEventListener("message", (event) => {
    if (event.source !== root || event.data?.channel !== "stickervox") return;
    if (event.data.type === "toggle") SV.ui.toggle();
  });

  root.postMessage({ channel: "stickervox", type: "ready" }, root.location.origin);
})(globalThis);
