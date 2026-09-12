const GRAPH_KEY = "kintoneLinkDialogGraph";
const MAX_NODES = 500;
const PENDING_URL_KEY = "pendingParentByUrl";
const PENDING_TTL_MS = 15000;

function normalizeUrl(href) {
  try {
    return new URL(href).href;
  } catch (e) {
    return href;
  }
}

// kintone's app list ("/k/<appId>/") and record detail ("/k/<appId>/show",
// with the record id in the "#record=<id>" hash) URL shapes are the same
// across every app/tenant. Mirrors map.js's parseAppInfo - kept as a
// separate copy since this extension has no shared-module setup, but the
// two should stay in sync.
function parseAppInfo(urlStr) {
  try {
    const url = new URL(urlStr);
    const listMatch = url.pathname.match(/^\/k\/(\d+)\/?$/);
    if (listMatch) {
      return { origin: url.origin, appId: listMatch[1], kind: "list" };
    }
    const showMatch = url.pathname.match(/^\/k\/(\d+)\/show\/?$/);
    if (showMatch) {
      const recordMatch = url.hash.match(/record=(\d+)/);
      return { origin: url.origin, appId: showMatch[1], kind: "record", recordId: recordMatch ? recordMatch[1] : null };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// The identity used to decide "is this the same node". For app list/record
// pages this deliberately ignores incidental differences (?view=, sort/
// filter query params, extra hash fragments) so e.g. the same record always
// maps to one node regardless of which link led there; anything else falls
// back to the full normalized URL.
function dedupeKey(urlStr) {
  const info = parseAppInfo(urlStr);
  if (!info) return normalizeUrl(urlStr);
  if (info.kind === "list") return `${info.origin}|list|${info.appId}`;
  return `${info.origin}|record|${info.appId}|${info.recordId || ""}`;
}

// Records one node per distinct page (see dedupeKey), kept in
// chrome.storage.local (not session/in-memory) so it survives the service
// worker being unloaded between uses, and capped so it doesn't grow forever
// with regular use. Revisiting the same page reuses that same node
// (returning its existing id) instead of creating a duplicate - so the map
// shows one hub per page, with every path that led there or from there
// branching off it, rather than a fresh copy every time. The node's parent
// is fixed at first-recording time and never reassigned on reuse, both to
// keep "first path taken" as the meaningful one and to avoid ever creating
// a cycle.
async function recordNode(url, parentId) {
  const { [GRAPH_KEY]: graph } = await chrome.storage.local.get({ [GRAPH_KEY]: { nodes: {} } });
  const normalized = normalizeUrl(url);
  const key = dedupeKey(normalized);

  const existing = Object.entries(graph.nodes).find(([, node]) => dedupeKey(node.url) === key);
  if (existing) {
    return existing[0];
  }

  const id = `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  graph.nodes[id] = {
    url: normalized,
    parentId: parentId && graph.nodes[parentId] ? parentId : null,
    createdAt: Date.now(),
  };

  const ids = Object.keys(graph.nodes);
  if (ids.length > MAX_NODES) {
    const sorted = ids.sort((a, b) => graph.nodes[a].createdAt - graph.nodes[b].createdAt);
    for (const oldId of sorted.slice(0, ids.length - MAX_NODES)) {
      delete graph.nodes[oldId];
    }
  }

  await chrome.storage.local.set({ [GRAPH_KEY]: graph });
  return id;
}

// Bridges a node's "parent" across a tab boundary for links that open in a
// new tab (ctrl/cmd/shift/middle-click, target="_blank"): we don't control
// that tab's creation, so we can't tag it by tab id ahead of time like we
// could before. Instead we remember "the next tab that lands on this exact
// URL should treat this as its parent", keyed by URL with a short expiry.
// chrome.storage.session survives service worker restarts but is cleared
// when the browser closes, which is the right lifetime for this.
async function registerPendingUrl(url, parentId) {
  if (!parentId) return;
  const { [PENDING_URL_KEY]: pending } = await chrome.storage.session.get({ [PENDING_URL_KEY]: {} });
  pending[normalizeUrl(url)] = { parentId, expiresAt: Date.now() + PENDING_TTL_MS };
  await chrome.storage.session.set({ [PENDING_URL_KEY]: pending });
}

async function takePendingUrl(url) {
  const key = normalizeUrl(url);
  const { [PENDING_URL_KEY]: pending } = await chrome.storage.session.get({ [PENDING_URL_KEY]: {} });
  const entry = pending[key];
  let parentId = null;
  if (entry) {
    if (entry.expiresAt > Date.now()) parentId = entry.parentId;
    delete pending[key];
    await chrome.storage.session.set({ [PENDING_URL_KEY]: pending });
  }
  return parentId;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.type === "kld-record-node" && message.url) {
    recordNode(message.url, message.parentId).then((nodeId) => {
      sendResponse({ nodeId });
    });
    return true;
  }

  if (message.type === "kld-register-pending-url" && message.url) {
    registerPendingUrl(message.url, message.parentId);
    return;
  }

  if (message.type === "kld-take-pending-url" && message.url) {
    takePendingUrl(message.url).then((parentId) => {
      sendResponse({ parentId });
    });
    return true;
  }
});
