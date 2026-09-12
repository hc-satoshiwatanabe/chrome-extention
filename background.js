const GRAPH_KEY = "kintoneLinkDialogGraph";
const MAX_NODES = 500;

function normalizeUrl(href) {
  try {
    return new URL(href).href;
  } catch (e) {
    return href;
  }
}

async function focusExistingTabOrCreate(url, parentId) {
  const target = normalizeUrl(url);
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => tab.url && normalizeUrl(tab.url) === target);

  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    const created = await chrome.tabs.create({ url });
    if (parentId) {
      await setPendingParent(created.id, parentId);
    }
  }
}

// Records one node per dialog opened, so a "path" of dialogs (within a tab,
// and across tabs via "open in new tab") can be reconstructed later on the
// map page. Kept in chrome.storage.local (not session/in-memory) so it
// survives the service worker being unloaded between uses, and capped so it
// doesn't grow forever with regular use.
async function recordNode(url, parentId, tabId) {
  const { [GRAPH_KEY]: graph } = await chrome.storage.local.get({ [GRAPH_KEY]: { nodes: {} } });
  const id = `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  graph.nodes[id] = {
    url,
    parentId: parentId && graph.nodes[parentId] ? parentId : null,
    tabId,
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

// Bridges a dialog's "parent" node across a tab boundary: when a new tab is
// created via "open in new tab", we remember the node it should attach to
// here (chrome.storage.session survives service worker restarts but is
// cleared when the browser closes, which is the right lifetime for this).
async function setPendingParent(tabId, parentId) {
  const { pendingParents } = await chrome.storage.session.get({ pendingParents: {} });
  pendingParents[tabId] = parentId;
  await chrome.storage.session.set({ pendingParents });
}

async function takePendingParent(tabId) {
  const { pendingParents } = await chrome.storage.session.get({ pendingParents: {} });
  const parentId = pendingParents[tabId] || null;
  if (parentId) {
    delete pendingParents[tabId];
    await chrome.storage.session.set({ pendingParents });
  }
  return parentId;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.type === "kld-open-new-tab" && message.url) {
    focusExistingTabOrCreate(message.url, message.parentId);
    return;
  }

  if (message.type === "kld-record-node" && message.url && sender.tab) {
    recordNode(message.url, message.parentId, sender.tab.id).then((nodeId) => {
      sendResponse({ nodeId });
    });
    return true;
  }

  if (message.type === "kld-get-pending-parent" && sender.tab) {
    takePendingParent(sender.tab.id).then((parentId) => {
      sendResponse({ parentId });
    });
    return true;
  }
});
