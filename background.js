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

// Records one node per tracked kintone page view, kept in
// chrome.storage.local (not session/in-memory) so it survives the service
// worker being unloaded between uses, and capped so it doesn't grow forever
// with regular use.
async function recordNode(url, parentId) {
  const { [GRAPH_KEY]: graph } = await chrome.storage.local.get({ [GRAPH_KEY]: { nodes: {} } });
  const id = `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  graph.nodes[id] = {
    url,
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
