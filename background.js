function normalizeUrl(href) {
  try {
    return new URL(href).href;
  } catch (e) {
    return href;
  }
}

async function focusExistingTabOrCreate(url) {
  const target = normalizeUrl(url);
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => tab.url && normalizeUrl(tab.url) === target);

  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "kld-open-new-tab" && message.url) {
    focusExistingTabOrCreate(message.url);
  }
});
