chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.type === "kld-open-new-tab-and-close" && sender.tab && sender.tab.id != null) {
    const originTabId = sender.tab.id;
    chrome.tabs.create({ url: message.url }).then(() => {
      chrome.tabs.remove(originTabId);
    });
  } else if (message.type === "kld-open-new-tab") {
    chrome.tabs.create({ url: message.url });
  }
});
