const STORAGE_KEY = "kintoneLinkDialogEnabled";
const CLOSE_ORIGINAL_TAB_KEY = "kintoneLinkDialogCloseOriginalTab";

const checkbox = document.getElementById("toggle");
const closeOriginalTabCheckbox = document.getElementById("closeOriginalTab");

chrome.storage.sync.get({ [STORAGE_KEY]: true, [CLOSE_ORIGINAL_TAB_KEY]: false }, (items) => {
  checkbox.checked = items[STORAGE_KEY];
  closeOriginalTabCheckbox.checked = items[CLOSE_ORIGINAL_TAB_KEY];
});

checkbox.addEventListener("change", () => {
  chrome.storage.sync.set({ [STORAGE_KEY]: checkbox.checked });
});

closeOriginalTabCheckbox.addEventListener("change", () => {
  chrome.storage.sync.set({ [CLOSE_ORIGINAL_TAB_KEY]: closeOriginalTabCheckbox.checked });
});
