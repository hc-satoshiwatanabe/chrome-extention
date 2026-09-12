const GRAPH_KEY = "kintoneLinkDialogGraph";

async function loadNodes() {
  const { [GRAPH_KEY]: graph } = await chrome.storage.local.get({ [GRAPH_KEY]: { nodes: {} } });
  return graph.nodes || {};
}

function shortLabel(url) {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch (e) {
    return url;
  }
}

function truncateLabel(label) {
  return label.length > 40 ? `${label.slice(0, 39)}…` : label;
}

// kintone's app list ("/k/<appId>/") and record detail ("/k/<appId>/show",
// with the record id in the "#record=<id>" hash) URL shapes are the same
// across every app/tenant, so this parsing is not app-specific.
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

const appNameCache = new Map();

function fetchAppName(origin, appId) {
  const key = `${origin}|${appId}`;
  if (!appNameCache.has(key)) {
    const promise = fetch(`${origin}/k/v1/app.json?id=${encodeURIComponent(appId)}`, {
      credentials: "same-origin",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data && data.name) || null)
      .catch(() => null);
    appNameCache.set(key, promise);
  }
  return appNameCache.get(key);
}

const titleFieldCache = new Map();

// Mirrors how kintone itself picks a record's display title: the app's
// configured "titleField" setting if one was manually chosen, otherwise the
// first single-line text field (kintone's own default when set to "AUTO").
function fetchTitleFieldCode(origin, appId) {
  const key = `${origin}|${appId}`;
  if (!titleFieldCache.has(key)) {
    titleFieldCache.set(
      key,
      (async () => {
        try {
          const res = await fetch(`${origin}/k/v1/app/settings.json?app=${encodeURIComponent(appId)}`, {
            credentials: "same-origin",
            headers: { "X-Requested-With": "XMLHttpRequest" },
          });
          if (res.ok) {
            const settings = await res.json();
            const tf = settings.titleField;
            if (tf && tf.selectionMode === "MANUAL" && tf.code) {
              return tf.code;
            }
          }
        } catch (e) {
          // fall through to the AUTO-mode heuristic below
        }

        try {
          const res = await fetch(`${origin}/k/v1/app/form/fields.json?app=${encodeURIComponent(appId)}`, {
            credentials: "same-origin",
            headers: { "X-Requested-With": "XMLHttpRequest" },
          });
          if (res.ok) {
            const data = await res.json();
            const entry = Object.entries(data.properties || {}).find(([, field]) => field.type === "SINGLE_LINE_TEXT");
            if (entry) return entry[0];
          }
        } catch (e) {
          // no luck - record nodes will just keep their "レコード#id" label
        }
        return null;
      })()
    );
  }
  return titleFieldCache.get(key);
}

const recordTitleCache = new Map();

function fetchRecordTitle(origin, appId, recordId) {
  const key = `${origin}|${appId}|${recordId}`;
  if (!recordTitleCache.has(key)) {
    recordTitleCache.set(
      key,
      (async () => {
        const fieldCode = await fetchTitleFieldCode(origin, appId);
        if (!fieldCode) return null;
        try {
          const res = await fetch(`${origin}/k/v1/record.json?app=${encodeURIComponent(appId)}&id=${encodeURIComponent(recordId)}`, {
            credentials: "same-origin",
            headers: { "X-Requested-With": "XMLHttpRequest" },
          });
          if (!res.ok) return null;
          const data = await res.json();
          const field = data.record && data.record[fieldCode];
          const value = field && field.value;
          return typeof value === "string" && value.trim() ? value : null;
        } catch (e) {
          return null;
        }
      })()
    );
  }
  return recordTitleCache.get(key);
}

function openUrl(url) {
  chrome.tabs.create({ url });
}

function formatDateTime(ms) {
  if (!ms) return "-";
  try {
    return new Date(ms).toLocaleString("ja-JP");
  } catch (e) {
    return "-";
  }
}

function kindLabel(info) {
  if (!info) return "その他";
  return info.kind === "record" ? "レコード" : "一覧";
}

const drawerEl = document.getElementById("drawer");
const drawerOverlayEl = document.getElementById("drawerOverlay");
const drawerTitleEl = document.getElementById("drawerTitle");
const drawerBodyEl = document.getElementById("drawerBody");
const drawerOpenBtn = document.getElementById("drawerOpenBtn");

let latestNodes = {};
let drawerNodeId = null;

function drawerField(label, value) {
  const wrap = document.createElement("div");
  wrap.className = "drawer-field";
  const labelEl = document.createElement("div");
  labelEl.className = "label";
  labelEl.textContent = label;
  const valueEl = document.createElement("div");
  valueEl.className = "value";
  valueEl.textContent = value;
  wrap.appendChild(labelEl);
  wrap.appendChild(valueEl);
  return wrap;
}

function showDrawer(id) {
  const node = latestNodes[id];
  if (!node) return;

  drawerNodeId = id;
  const info = parseAppInfo(node.url);

  drawerTitleEl.textContent = shortLabel(node.url);
  drawerBodyEl.innerHTML = "";
  drawerBodyEl.appendChild(drawerField("種別", kindLabel(info)));
  if (info && info.kind === "record" && info.recordId) {
    drawerBodyEl.appendChild(drawerField("レコード番号", info.recordId));
  }
  drawerBodyEl.appendChild(drawerField("記録日時", formatDateTime(node.createdAt)));
  drawerBodyEl.appendChild(drawerField("URL", node.url));

  drawerOverlayEl.hidden = false;
  drawerEl.classList.add("open");

  if (info) {
    fetchAppName(info.origin, info.appId).then((appName) => {
      if (!appName || drawerNodeId !== id) return;
      const suffix = info.kind === "record" ? ` - レコード#${info.recordId || "?"}` : " - 一覧";
      drawerTitleEl.textContent = `${appName}${suffix}`;

      if (info.kind === "record" && info.recordId) {
        fetchRecordTitle(info.origin, info.appId, info.recordId).then((titleValue) => {
          if (!titleValue || drawerNodeId !== id) return;
          drawerTitleEl.textContent = `${appName} - ${titleValue}`;
        });
      }
    });
  }
}

function hideDrawer() {
  drawerNodeId = null;
  drawerEl.classList.remove("open");
  drawerOverlayEl.hidden = true;
}

document.getElementById("drawerClose").addEventListener("click", hideDrawer);
drawerOverlayEl.addEventListener("click", hideDrawer);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideDrawer();
});
drawerOpenBtn.addEventListener("click", () => {
  const node = drawerNodeId && latestNodes[drawerNodeId];
  if (node) openUrl(node.url);
});

let cy = null;
let renderVersion = 0;

const CY_STYLE = [
  {
    selector: "node",
    style: {
      shape: "round-rectangle",
      "background-color": "#ffffff",
      "border-color": "#3498db",
      "border-width": 1.5,
      label: "data(label)",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 11,
      color: "#222",
      padding: "10px",
      width: "label",
      height: "label",
      "text-wrap": "wrap",
      "text-max-width": "150px",
      "text-overflow-wrap": "anywhere",
    },
  },
  {
    selector: "node:active",
    style: { "overlay-opacity": 0.15, "overlay-color": "#3498db" },
  },
  {
    selector: "edge",
    style: {
      width: 1.5,
      "line-color": "#b8c4cc",
      "target-arrow-color": "#b8c4cc",
      "target-arrow-shape": "triangle",
      "arrow-scale": 0.8,
      "curve-style": "bezier",
    },
  },
];

async function render() {
  const myVersion = ++renderVersion;
  const nodes = await loadNodes();
  latestNodes = nodes;
  const ids = Object.keys(nodes);

  const empty = document.getElementById("empty");
  const container = document.getElementById("cy");

  if (ids.length === 0) {
    empty.hidden = false;
    container.hidden = true;
    if (cy) {
      cy.destroy();
      cy = null;
    }
    return;
  }
  empty.hidden = true;
  container.hidden = false;

  const previousView = cy ? { zoom: cy.zoom(), pan: cy.pan() } : null;
  if (cy) {
    cy.destroy();
    cy = null;
  }

  const elements = [];
  const rootIds = [];
  for (const [id, node] of Object.entries(nodes)) {
    elements.push({ data: { id, url: node.url, label: truncateLabel(shortLabel(node.url)) } });
  }
  for (const [id, node] of Object.entries(nodes)) {
    if (node.parentId && nodes[node.parentId]) {
      elements.push({ data: { id: `e_${node.parentId}_${id}`, source: node.parentId, target: id } });
    } else {
      rootIds.push(id);
    }
  }

  const thisCy = cytoscape({
    container,
    elements,
    style: CY_STYLE,
    layout: {
      name: "breadthfirst",
      directed: true,
      roots: rootIds,
      padding: 30,
      spacingFactor: 1.25,
    },
    wheelSensitivity: 0.3,
  });
  cy = thisCy;

  thisCy.on("tap", "node", (evt) => {
    showDrawer(evt.target.id());
  });

  if (previousView) {
    thisCy.zoom(previousView.zoom);
    thisCy.pan(previousView.pan);
  }

  for (const [id, node] of Object.entries(nodes)) {
    const info = parseAppInfo(node.url);
    if (!info) continue;

    fetchAppName(info.origin, info.appId).then((appName) => {
      if (!appName || myVersion !== renderVersion) return;
      const ele = thisCy.getElementById(id);
      if (ele.empty()) return;
      const suffix = info.kind === "record" ? ` - レコード#${info.recordId || "?"}` : " - 一覧";
      ele.data("label", truncateLabel(`${appName}${suffix}`));

      if (info.kind === "record" && info.recordId) {
        fetchRecordTitle(info.origin, info.appId, info.recordId).then((titleValue) => {
          if (!titleValue || myVersion !== renderVersion) return;
          const ele2 = thisCy.getElementById(id);
          if (ele2.empty()) return;
          ele2.data("label", truncateLabel(`${appName} - ${titleValue}`));
        });
      }
    });
  }
}

document.getElementById("clear").addEventListener("click", async () => {
  await chrome.storage.local.set({ [GRAPH_KEY]: { nodes: {} } });
  render();
});

const REFRESH_INTERVAL_MS = 5000;
let isRendering = false;

async function renderIfIdle() {
  if (isRendering) return;
  isRendering = true;
  try {
    await render();
  } finally {
    isRendering = false;
  }
}

renderIfIdle();
setInterval(renderIfIdle, REFRESH_INTERVAL_MS);
