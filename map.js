const GRAPH_KEY = "kintoneLinkDialogGraph";
const SVG_NS = "http://www.w3.org/2000/svg";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 32;
const LEVEL_GAP = 60;
const ROW_GAP = 12;

async function loadNodes() {
  const { [GRAPH_KEY]: graph } = await chrome.storage.local.get({ [GRAPH_KEY]: { nodes: {} } });
  return graph.nodes || {};
}

function buildChildren(nodes) {
  const children = {};
  const roots = [];
  for (const [id, node] of Object.entries(nodes)) {
    if (node.parentId && nodes[node.parentId]) {
      (children[node.parentId] = children[node.parentId] || []).push(id);
    } else {
      roots.push(id);
    }
  }
  for (const key in children) {
    children[key].sort((a, b) => nodes[a].createdAt - nodes[b].createdAt);
  }
  roots.sort((a, b) => nodes[a].createdAt - nodes[b].createdAt);
  return { roots, children };
}

// Simple top-down tree layout: leaves are stacked in visiting order, each
// parent is centered on the vertical span of its children.
function layout(nodes, roots, children) {
  const positions = {};
  let row = 0;

  function place(id, depth) {
    const kids = children[id] || [];
    if (kids.length === 0) {
      positions[id] = { x: depth * (NODE_WIDTH + LEVEL_GAP), y: row * (NODE_HEIGHT + ROW_GAP) };
      row++;
    } else {
      const ys = kids.map((k) => {
        place(k, depth + 1);
        return positions[k].y;
      });
      positions[id] = {
        x: depth * (NODE_WIDTH + LEVEL_GAP),
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
    }
  }

  for (const r of roots) place(r, 0);
  return positions;
}

function shortLabel(url) {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch (e) {
    return url;
  }
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function openUrl(url) {
  chrome.tabs.create({ url });
}

async function render() {
  const nodes = await loadNodes();
  const ids = Object.keys(nodes);
  const empty = document.getElementById("empty");
  const scroll = document.getElementById("scroll");
  const svg = document.getElementById("canvas");
  svg.innerHTML = "";

  if (ids.length === 0) {
    empty.hidden = false;
    scroll.hidden = true;
    return;
  }
  empty.hidden = true;
  scroll.hidden = false;

  const { roots, children } = buildChildren(nodes);
  const positions = layout(nodes, roots, children);

  let maxX = 0;
  let maxY = 0;
  for (const pos of Object.values(positions)) {
    maxX = Math.max(maxX, pos.x);
    maxY = Math.max(maxY, pos.y);
  }
  const width = maxX + NODE_WIDTH + 40;
  const height = maxY + NODE_HEIGHT + 40;
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const edgeLayer = svgEl("g", {});
  const nodeLayer = svgEl("g", {});
  svg.appendChild(edgeLayer);
  svg.appendChild(nodeLayer);

  for (const [parentId, kidIds] of Object.entries(children)) {
    const p = positions[parentId];
    for (const kidId of kidIds) {
      const c = positions[kidId];
      const x1 = p.x + NODE_WIDTH + 20;
      const y1 = p.y + NODE_HEIGHT / 2 + 20;
      const x2 = c.x + 20;
      const y2 = c.y + NODE_HEIGHT / 2 + 20;
      const midX = (x1 + x2) / 2;
      const path = svgEl("path", {
        class: "edge",
        d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
      });
      edgeLayer.appendChild(path);
    }
  }

  for (const id of ids) {
    const pos = positions[id];
    if (!pos) continue;
    const node = nodes[id];
    const g = svgEl("g", { transform: `translate(${pos.x + 20}, ${pos.y + 20})`, style: "cursor: pointer;" });
    const rect = svgEl("rect", {
      class: "node-box",
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      rx: 6,
    });
    const text = svgEl("text", {
      class: "node-label",
      x: 8,
      y: NODE_HEIGHT / 2 + 4,
    });
    const label = shortLabel(node.url);
    text.textContent = label.length > 34 ? `${label.slice(0, 33)}…` : label;

    const title = svgEl("title", {});
    title.textContent = node.url;

    g.appendChild(rect);
    g.appendChild(text);
    g.appendChild(title);
    g.addEventListener("click", () => openUrl(node.url));
    nodeLayer.appendChild(g);
  }
}

document.getElementById("clear").addEventListener("click", async () => {
  await chrome.storage.local.set({ [GRAPH_KEY]: { nodes: {} } });
  render();
});

render();
