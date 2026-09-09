(function () {
  "use strict";

  const STORAGE_KEY = "kintoneLinkDialogEnabled";
  const HOST_ID = "kintone-link-dialog-host";

  let enabled = true;

  chrome.storage.sync.get({ [STORAGE_KEY]: true }, (items) => {
    enabled = items[STORAGE_KEY];
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && STORAGE_KEY in changes) {
      enabled = changes[STORAGE_KEY].newValue;
    }
  });

  const STYLE = `
    .kld-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .kld-dialog {
      width: 95vw;
      height: 90vh;
      max-width: 1600px;
      background: #fff;
      border-radius: 6px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .kld-header {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      padding: 6px 10px;
      background: #f4f4f4;
      border-bottom: 1px solid #ddd;
      flex: 0 0 auto;
    }
    .kld-newtab {
      font-size: 13px;
      color: #3498db;
      text-decoration: none;
    }
    .kld-newtab:hover {
      text-decoration: underline;
    }
    .kld-close {
      appearance: none;
      border: none;
      background: transparent;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      color: #555;
      padding: 2px 6px;
    }
    .kld-close:hover {
      color: #000;
    }
    .kld-iframe {
      flex: 1 1 auto;
      width: 100%;
      border: none;
    }
  `;

  function shouldIntercept(anchor, event) {
    if (!enabled) return false;
    if (!anchor) return false;
    if (event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (anchor.hasAttribute("download")) return false;

    const rawHref = anchor.getAttribute("href") || "";
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
      return false;
    }

    let url;
    try {
      url = new URL(anchor.href, location.href);
    } catch (e) {
      return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    if (isExcludedPath(url)) return false;

    return true;
  }

  function isExcludedPath(url) {
    return /\/(space|portal)(\/|$|\?)/.test(url.pathname) || /\/(space|portal)(\/|$|\?)/.test(url.hash);
  }

  function closeDialog() {
    const host = document.getElementById(HOST_ID);
    if (host) {
      if (host._onKeydown) {
        document.removeEventListener("keydown", host._onKeydown, true);
      }
      host.remove();
    }
  }

  function openDialog(url) {
    closeDialog();

    const host = document.createElement("div");
    host.id = HOST_ID;
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLE;
    shadow.appendChild(style);

    const overlay = document.createElement("div");
    overlay.className = "kld-overlay";

    const dialog = document.createElement("div");
    dialog.className = "kld-dialog";

    const header = document.createElement("div");
    header.className = "kld-header";

    const newTabLink = document.createElement("a");
    newTabLink.href = url;
    newTabLink.target = "_blank";
    newTabLink.rel = "noopener noreferrer";
    newTabLink.className = "kld-newtab";
    newTabLink.textContent = "新しいタブで開く ↗";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "kld-close";
    closeBtn.setAttribute("aria-label", "閉じる");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeDialog);

    header.appendChild(newTabLink);
    header.appendChild(closeBtn);

    const iframe = document.createElement("iframe");
    iframe.className = "kld-iframe";
    iframe.src = url;

    dialog.appendChild(header);
    dialog.appendChild(iframe);
    overlay.appendChild(dialog);
    shadow.appendChild(overlay);

    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) closeDialog();
    });

    function onKeydown(e) {
      if (e.key === "Escape") closeDialog();
    }
    document.addEventListener("keydown", onKeydown, true);
    host._onKeydown = onKeydown;
  }

  document.addEventListener(
    "click",
    (event) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!shouldIntercept(anchor, event)) return;
      event.preventDefault();
      event.stopPropagation();
      openDialog(anchor.href);
    },
    true
  );
})();
