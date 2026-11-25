// StickerVox service worker: the toolbar button toggles the panel inside WhatsApp Web.
const WHATSAPP_URL = "https://web.whatsapp.com/";
const openWhenReady = new Set();

async function toggleIn(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "stickervox:toggle" });
  } catch {
    // The tab predates the extension, so it has no content scripts yet.
    openWhenReady.add(tabId);
    await chrome.tabs.reload(tabId);
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.url?.startsWith(WHATSAPP_URL)) return toggleIn(tab.id);
  const [existing] = await chrome.tabs.query({ url: WHATSAPP_URL + "*" });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return toggleIn(existing.id);
  }
  const created = await chrome.tabs.create({ url: WHATSAPP_URL });
  openWhenReady.add(created.id);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab?.id;
  if (message?.type === "stickervox:ready" && openWhenReady.delete(tabId)) {
    chrome.tabs.sendMessage(tabId, { type: "stickervox:toggle" }).catch(() => {});
  }
});
