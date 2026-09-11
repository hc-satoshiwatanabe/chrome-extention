const STORAGE_KEY = "kintoneLinkDialogEnabled";
const checkbox = document.getElementById("toggle");

chrome.storage.sync.get({ [STORAGE_KEY]: true }, (items) => {
  checkbox.checked = items[STORAGE_KEY];
});

checkbox.addEventListener("change", () => {
  chrome.storage.sync.set({ [STORAGE_KEY]: checkbox.checked });
});
