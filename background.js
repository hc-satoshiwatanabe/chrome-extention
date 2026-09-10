chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "kld-open-new-tab-and-close" && sender.tab && sender.tab.id != null) {
    const originTabId = sender.tab.id;
    chrome.tabs.create({ url: message.url }).then(() => {
      chrome.tabs.remove(originTabId);
    });
  }
});
