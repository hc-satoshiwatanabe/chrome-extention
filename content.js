(function () {
  "use strict";

  const STORAGE_KEY = "kintoneLinkDialogEnabled";
  const SESSION_KEY = "kldCurrentNodeId";

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
    // reload/update) - tracking just won't activate on this page until it's
    // reloaded, but nothing throws.
  }

  function isExcludedPath(url) {
    return /\/(space|portal)(\/|$|\?)/.test(url.pathname) || /\/(space|portal)(\/|$|\?)/.test(url.hash);
  }

  // sessionStorage is scoped per tab (and survives full page reloads within
  // that tab), so it is exactly the right place to carry "which node was I
  // on" across kintone's own full-page navigations (e.g. switching to a
  // different app) without needing any cross-tab messaging.
  function getSessionNodeId() {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch (e) {
      return null;
    }
  }

  function setSessionNodeId(id) {
    try {
      sessionStorage.setItem(SESSION_KEY, id);
    } catch (e) {
      // ignore - worst case this tab's chain just restarts from a root
    }
  }

  async function recordNode(url, parentId) {
    try {
      const resp = await chrome.runtime.sendMessage({ type: "kld-record-node", url, parentId });
      return (resp && resp.nodeId) || null;
    } catch (e) {
      // extension context invalidated - tracking just stops silently
      return null;
    }
  }

  async function registerPendingParentForUrl(url, parentId) {
    if (!parentId) return;
    try {
      await chrome.runtime.sendMessage({ type: "kld-register-pending-url", url, parentId });
    } catch (e) {
      // extension context invalidated - the new tab just starts as a fresh root
    }
  }

  async function takePendingParentForUrl(url) {
    try {
      const resp = await chrome.runtime.sendMessage({ type: "kld-take-pending-url", url });
      return (resp && resp.parentId) || null;
    } catch (e) {
      return null;
    }
  }

  let currentNodeId = getSessionNodeId();
  let lastTrackedHref = null;

  // kintone handles most in-app navigation (record <-> list <-> related
  // record) through its own SPA router (pushState/hash changes) rather than
  // full page loads, so tracking by watching the URL change - instead of
  // intercepting clicks - captures the real path, including back/forward
  // navigation and address-bar/bookmark visits, not just clicks we happen
  // to catch.
  async function trackIfChanged() {
    if (!enabled) return;
    let current;
    try {
      current = new URL(location.href);
    } catch (e) {
      return;
    }
    if (isExcludedPath(current)) return;
    const normalized = current.href;
    if (normalized === lastTrackedHref) return;
    lastTrackedHref = normalized;

    let parentId = currentNodeId;
    if (!parentId) {
      // Fresh tab/session: maybe this URL was just opened from a link we
      // tagged a moment ago (see the click listener below).
      parentId = await takePendingParentForUrl(normalized);
    }

    const nodeId = await recordNode(normalized, parentId);
    if (nodeId) {
      currentNodeId = nodeId;
      setSessionNodeId(nodeId);
    }
  }

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  history.pushState = function (...args) {
    const result = originalPushState(...args);
    trackIfChanged();
    return result;
  };
  history.replaceState = function (...args) {
    const result = originalReplaceState(...args);
    trackIfChanged();
    return result;
  };
  window.addEventListener("popstate", trackIfChanged);
  window.addEventListener("hashchange", trackIfChanged);

  trackIfChanged();

  // Purely observational: when a link is about to open in a NEW tab (a
  // modifier-click, middle-click, or target="_blank"), tag that destination
  // URL with the current node as its parent so the new tab's own content
  // script - which has no memory of this one - can pick it up. Nothing is
  // prevented or redirected here; the click behaves exactly as it would
  // without this extension.
  function handlePossibleNewTabClick(event) {
    if (!enabled) return;
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!anchor) return;

    const opensNewTab = anchor.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1;
    if (!opensNewTab) return;

    let url;
    try {
      url = new URL(anchor.href, location.href);
    } catch (e) {
      return;
    }
    if (url.origin !== location.origin) return;
    if (isExcludedPath(url)) return;

    registerPendingParentForUrl(url.href, currentNodeId);
  }

  document.addEventListener("click", handlePossibleNewTabClick, true);
  document.addEventListener("auxclick", handlePossibleNewTabClick, true);

  // Some links aren't plain <a target="_blank"> tags at all - kintone
  // customizations (e.g. a "related record" link built from a lookup field)
  // often open a new tab by calling window.open(url) from a click handler
  // on a button/div. That bypasses the anchor-based detection above
  // entirely, so we also tag the destination here, at the one chokepoint
  // every such call has to go through regardless of how it's triggered.
  try {
    const originalWindowOpen = window.open.bind(window);
    window.open = function (url, ...rest) {
      if (enabled && url) {
        try {
          const resolved = new URL(url, location.href);
          if (resolved.origin === location.origin && !isExcludedPath(resolved)) {
            registerPendingParentForUrl(resolved.href, currentNodeId);
          }
        } catch (e) {
          // malformed/relative-without-base url - nothing to tag
        }
      }
      return originalWindowOpen(url, ...rest);
    };
  } catch (e) {
    // window.open not configurable in this context - new tabs opened this
    // way just won't be linked to their origin, same as before
  }
})();
