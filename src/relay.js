// StickerVox relay (isolated world): carries messages between the service worker and the page.
const PAGE_CHANNEL = "stickervox";

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "stickervox:toggle") {
    window.postMessage({ channel: PAGE_CHANNEL, type: "toggle" }, location.origin);
  }
});

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.channel !== PAGE_CHANNEL) return;
  if (event.data.type === "ready") chrome.runtime.sendMessage({ type: "stickervox:ready" }).catch(() => {});
});
