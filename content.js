(function () {
  "use strict";

  const STORAGE_KEY = "kintoneLinkDialogEnabled";
  const HOST_ID = "kintone-link-dialog-host";

  let enabled = true;

  try {
    chrome.storage.sync.get({ [STORAGE_KEY]: true }, (items) => {
      if (chrome.runtime.lastError) return;
      enabled = items[STORAGE_KEY];
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (STORAGE_KEY in changes) enabled = changes[STORAGE_KEY].newValue;
    });
  } catch (e) {
    // extension context invalidated (stale content script from before a
    // reload/update) - the dialog feature just won't activate on this page
    // until it's reloaded, but nothing throws.
  }

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
      cursor: move;
    }
    .kld-newtab {
      font-size: 13px;
      color: #3498db;
      text-decoration: none;
      cursor: pointer;
    }
    .kld-newtab:hover {
      text-decoration: underline;
    }
    .kld-view-select {
      font-size: 13px;
      color: #333;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 3px 6px;
      background: #fff;
      max-width: 220px;
      cursor: pointer;
    }
    .kld-view-select:disabled {
      color: #999;
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

    // Links leaving the current kintone tenant (a different origin) fall
    // through to the browser's normal link behavior instead of the dialog.
    if (url.origin !== location.origin) return false;

    if (isExcludedPath(url)) return false;

    return true;
  }

  function isExcludedPath(url) {
    return /\/(space|portal)(\/|$|\?)/.test(url.pathname) || /\/(space|portal)(\/|$|\?)/.test(url.hash);
  }

  // kintone's app list screen URL is always "/k/<appId>/" (optionally with
  // a "?view=<viewId>" query). This convention is the same across every
  // kintone app/tenant, so this parsing is not app-specific.
  function parseAppListUrl(url) {
    const match = url.pathname.match(/^\/k\/(\d+)\/?$/);
    if (!match) return null;
    return { appId: match[1], viewId: url.searchParams.get("view") };
  }

  const LAST_VIEW_KEY = "kintoneLinkDialogLastView";

  function lastViewStorageKey(origin, appId) {
    return `${origin}|${appId}`;
  }

  // The extension can be reloaded/updated while a kintone tab stays open;
  // that tab's content script then holds a stale, invalidated extension
  // context, and any chrome.* call throws "Extension context invalidated."
  // These wrappers degrade gracefully (no-op / resolve null) instead of
  // surfacing that as an uncaught error - the user only needs to reload
  // the tab to get the extension working there again.
  function getLastView(origin, appId) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get({ [LAST_VIEW_KEY]: {} }, (items) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(items[LAST_VIEW_KEY][lastViewStorageKey(origin, appId)] || null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function saveLastView(origin, appId, viewId) {
    try {
      chrome.storage.local.get({ [LAST_VIEW_KEY]: {} }, (items) => {
        if (chrome.runtime.lastError) return;
        const map = items[LAST_VIEW_KEY];
        map[lastViewStorageKey(origin, appId)] = viewId;
        chrome.storage.local.set({ [LAST_VIEW_KEY]: map });
      });
    } catch (e) {
      // extension context invalidated - ignore, nothing to persist to
    }
  }

  async function fetchAppViews(origin, appId) {
    const endpoint = `${origin}/k/v1/app/views.json?app=${encodeURIComponent(appId)}`;
    const res = await fetch(endpoint, {
      credentials: "same-origin",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!res.ok) throw new Error(`views.json request failed: ${res.status}`);
    const data = await res.json();
    const views = Object.values(data.views || {});
    views.sort((a, b) => Number(a.index) - Number(b.index));
    return views;
  }

  function buildViewSelect(url, onChange) {
    const parsed = parseAppListUrl(url);
    if (!parsed) return null;

    const select = document.createElement("select");
    select.className = "kld-view-select";
    select.disabled = true;

    const loadingOption = document.createElement("option");
    loadingOption.textContent = "一覧を読み込み中...";
    select.appendChild(loadingOption);

    fetchAppViews(url.origin, parsed.appId)
      .then((views) => {
        select.innerHTML = "";
        for (const view of views) {
          const option = document.createElement("option");
          option.value = view.id;
          option.textContent = view.name;
          if (parsed.viewId ? view.id === parsed.viewId : false) {
            option.selected = true;
          }
          select.appendChild(option);
        }
        select.disabled = false;
      })
      .catch(() => {
        select.innerHTML = "";
        const errorOption = document.createElement("option");
        errorOption.textContent = "一覧を取得できませんでした";
        select.appendChild(errorOption);
      });

    select.addEventListener("change", () => {
      const newUrl = new URL(url.href);
      newUrl.searchParams.set("view", select.value);
      onChange(newUrl.href, select.value);
    });

    return select;
  }

  // Lets the dialog be repositioned by dragging its header. The overlay
  // centers the dialog via flexbox only until the first drag: once dragged,
  // the dialog switches to an explicit fixed position so it stays where the
  // user left it (a fresh dialog for the next link click still starts centered).
  function makeDraggable(dialog, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let previousUserSelect = "";

    function onMouseDown(e) {
      if (e.button !== 0) return;
      if (e.target.closest("a, button, select")) return;

      const rect = dialog.getBoundingClientRect();
      dialog.style.position = "fixed";
      dialog.style.margin = "0";
      dialog.style.left = `${rect.left}px`;
      dialog.style.top = `${rect.top}px`;

      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";
      e.preventDefault();
    }

    function onMouseMove(e) {
      if (!dragging) return;
      const margin = 24;
      const newLeft = clamp(startLeft + (e.clientX - startX), margin - dialog.offsetWidth, window.innerWidth - margin);
      const newTop = clamp(startTop + (e.clientY - startY), 0, window.innerHeight - margin);
      dialog.style.left = `${newLeft}px`;
      dialog.style.top = `${newTop}px`;
    }

    function onMouseUp() {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = previousUserSelect;
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    handle.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);

    return function cleanup() {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);
    };
  }

  function closeDialog() {
    const host = document.getElementById(HOST_ID);
    if (host) {
      if (host._onKeydown) {
        document.removeEventListener("keydown", host._onKeydown, true);
      }
      if (host._cleanupDrag) {
        host._cleanupDrag();
      }
      host.remove();
    }
  }

  async function openDialog(rawUrl) {
    closeDialog();

    let url;
    try {
      url = new URL(rawUrl);
    } catch (e) {
      return;
    }

    const appListInfo = parseAppListUrl(url);
    if (appListInfo && !appListInfo.viewId) {
      const lastViewId = await getLastView(url.origin, appListInfo.appId);
      if (lastViewId) {
        url.searchParams.set("view", lastViewId);
      }
    }

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

    const iframe = document.createElement("iframe");
    iframe.className = "kld-iframe";
    iframe.src = url.href;

    const newTabLink = document.createElement("a");
    newTabLink.href = url.href;
    newTabLink.target = "_blank";
    newTabLink.rel = "noopener noreferrer";
    newTabLink.className = "kld-newtab";
    newTabLink.textContent = "新しいタブで開く ↗";
    newTabLink.addEventListener("click", (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      try {
        chrome.runtime.sendMessage({ type: "kld-open-new-tab", url: newTabLink.href }).catch(() => {});
      } catch (err) {
        // extension context invalidated - fall back to a plain new-tab open
        window.open(newTabLink.href, "_blank", "noopener,noreferrer");
      }
    });

    const viewSelect = buildViewSelect(url, (newHref, viewId) => {
      iframe.src = newHref;
      newTabLink.href = newHref;
      if (appListInfo) saveLastView(url.origin, appListInfo.appId, viewId);
    });

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "kld-close";
    closeBtn.setAttribute("aria-label", "閉じる");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeDialog);

    if (viewSelect) header.appendChild(viewSelect);
    header.appendChild(newTabLink);
    header.appendChild(closeBtn);

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
    host._cleanupDrag = makeDraggable(dialog, header);
  }

  document.addEventListener(
    "click",
    (event) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!shouldIntercept(anchor, event)) return;
      event.preventDefault();
      event.stopPropagation();
      openDialog(anchor.href).catch(() => {});
    },
    true
  );
})();
