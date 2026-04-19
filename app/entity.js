'use strict';

function _efSortLayout(entities, relations) {
  const deg = {};
  const grpScore = {};
  const grpLink = {};
  for(const e of entities) {
    deg[e.id] = 0;
    const grp = e.group || '';
    grpScore[grp] = grpScore[grp] || 0;
    grpLink[grp] = grpLink[grp] || {};
  }
  for(const r of relations) {
    if(deg[r.from]!==undefined) deg[r.from]++;
    if(deg[r.to]  !==undefined) deg[r.to]++;
    const fromGrp = entities.find(e=>e.id===r.from)?.group || '';
    const toGrp   = entities.find(e=>e.id===r.to)?.group || '';
    grpScore[fromGrp] = (grpScore[fromGrp] || 0) + 1;
    grpScore[toGrp]   = (grpScore[toGrp] || 0) + 1;
    if(fromGrp !== toGrp) {
      grpLink[fromGrp] = grpLink[fromGrp] || {};
      grpLink[toGrp] = grpLink[toGrp] || {};
      grpLink[fromGrp][toGrp] = (grpLink[fromGrp][toGrp] || 0) + 1;
      grpLink[toGrp][fromGrp] = (grpLink[toGrp][fromGrp] || 0) + 1;
    }
  }

  const allGroups = [...new Set(entities.map(e=>e.group||''))];
  if(!allGroups.length) return [];

  const sortedGroups = [];
  const used = new Set();
  let current = [...allGroups].sort((a,b)=>(grpScore[b]||0)-(grpScore[a]||0))[0];
  while(current) {
    sortedGroups.push(current);
    used.add(current);
    let nextGroup = null;
    let nextScore = -1;
    for(const grp of allGroups) {
      if(used.has(grp)) continue;
      const score = (grpLink[current]?.[grp] || 0) * 100 + (grpScore[grp] || 0);
      if(score > nextScore) {
        nextScore = score;
        nextGroup = grp;
      }
    }
    current = nextGroup;
  }

  return sortedGroups.map((grp) => ({
    grp,
    entities: entities
      .filter(e=>(e.group||'')===grp)
      .sort((a,b)=>(deg[b.id]||0)-(deg[a.id]||0) || a.id.localeCompare(b.id)),
  }));
}

/* ── ER 图节点默认布局计算 ── */
const EF_NODE_W = 120;   // 预估节点宽
const EF_NODE_H = 38;    // 预估节点高
const EF_GAP_X  = 40;    // 同行间距
const EF_GAP_Y  = 70;    // 行间距
const EF_PAD    = 20;    // 边距
const EF_GROUP_HEADER_H = 28;
const EF_GROUP_PAD_X = 22;
const EF_GROUP_PAD_Y = 18;
const EF_GROUP_GAP_X = 56;
const EF_GROUP_GAP_Y = 56;

function _efGetGroupColumnCount(entityCount) {
  if(entityCount >= 12) return 3;
  if(entityCount >= 7) return 2;
  return 1;
}

function _efMeasureGroupBlock(groupBlock) {
  const groupEntities = groupBlock.entities || [];
  const colCount = _efGetGroupColumnCount(groupEntities.length);
  const rowCount = Math.max(1, Math.ceil(groupEntities.length / colCount));
  const contentWidth = colCount * EF_NODE_W + Math.max(0, colCount - 1) * EF_GAP_X;
  const contentHeight = rowCount * EF_NODE_H + Math.max(0, rowCount - 1) * EF_GAP_Y;
  return {
    colCount,
    rowCount,
    width: contentWidth + EF_GROUP_PAD_X * 2,
    height: contentHeight + EF_GROUP_HEADER_H + EF_GROUP_PAD_Y * 2,
  };
}

function _efGetGroupGridColumns(groupCount) {
  if(groupCount <= 1) return 1;
  if(groupCount <= 4) return 2;
  if(groupCount <= 9) return 3;
  return 4;
}

function _efComputeDefaultPos(entities, relations) {
  if(!entities.length) return {};
  const posMap = {};
  const sortedGroups = _efSortLayout(entities, relations)
    .map(groupBlock => ({ ...groupBlock, layout: _efMeasureGroupBlock(groupBlock) }));
  const gridCols = _efGetGroupGridColumns(sortedGroups.length);
  const cellWidth = Math.max(...sortedGroups.map(groupBlock => groupBlock.layout.width), EF_NODE_W + EF_GROUP_PAD_X * 2);
  const cellHeight = Math.max(...sortedGroups.map(groupBlock => groupBlock.layout.height), EF_NODE_H + EF_GROUP_HEADER_H + EF_GROUP_PAD_Y * 2);

  sortedGroups.forEach((groupBlock, index) => {
    const groupEntities = groupBlock.entities || [];
    const colCount = groupBlock.layout.colCount;
    const rowGap = EF_NODE_H + EF_GAP_Y;
    const colGap = EF_NODE_W + EF_GAP_X;
    const rawRow = Math.floor(index / gridCols);
    const rawCol = index % gridCols;
    const itemsInRow = Math.min(gridCols, sortedGroups.length - rawRow * gridCols);
    const layoutCol = rawRow % 2 === 0 ? rawCol : (itemsInRow - 1 - rawCol);
    const baseX = EF_PAD + layoutCol * (cellWidth + EF_GROUP_GAP_X);
    const baseY = EF_PAD + rawRow * (cellHeight + EF_GROUP_GAP_Y);

    groupEntities.forEach((entity, index) => {
      const col = index % colCount;
      const row = Math.floor(index / colCount);
      posMap[entity.id] = {
        x: baseX + EF_GROUP_PAD_X + col * colGap,
        y: baseY + EF_GROUP_HEADER_H + EF_GROUP_PAD_Y + row * rowGap,
      };
    });
  });
  return posMap;
}

function _efGetFocusRelatedIds(relations, focusEntityId) {
  const ids = new Set();
  if(!focusEntityId) return ids;
  for(const rel of relations) {
    if(rel.from === focusEntityId) ids.add(rel.to);
    if(rel.to === focusEntityId) ids.add(rel.from);
  }
  return ids;
}

function _efComputeGroupFrames(entities) {
  const frames = {};
  for(const entity of entities) {
    const group = entity.group || '未分组';
    const x = entity.pos?.x || EF_PAD;
    const y = entity.pos?.y || EF_PAD;
    const left = x - EF_GROUP_PAD_X;
    const top = y - EF_GROUP_HEADER_H - EF_GROUP_PAD_Y;
    const right = x + EF_NODE_W + EF_GROUP_PAD_X;
    const bottom = y + EF_NODE_H + EF_GROUP_PAD_Y;
    if(!frames[group]) {
      frames[group] = { group, left, top, right, bottom };
      continue;
    }
    frames[group].left = Math.min(frames[group].left, left);
    frames[group].top = Math.min(frames[group].top, top);
    frames[group].right = Math.max(frames[group].right, right);
    frames[group].bottom = Math.max(frames[group].bottom, bottom);
  }
  return Object.values(frames);
}

/* ── 实体图交互状态 ──────────────────────────────────────── */
const efSelectedIds = new Set();   // 当前选中的实体 ID
let efDragState   = null;          // 节点拖拽状态
let efDragMoved   = false;
let efPanState    = null;          // 背景平移状态
let efRubberState = null;          // 框选状态
let efRubberEl    = null;          // 框选 DOM 元素

/* 刷新选中节点的视觉样式 */
function updateEfSelection(containerId) {
  const canvas = document.getElementById(`ef-canvas-${containerId}`);
  if(!canvas) return;
  canvas.querySelectorAll('.ef-node').forEach(node => {
    node.classList.toggle('ef-selected', efSelectedIds.has(node.dataset.id));
  });
}

function updateEfGroupFrames(containerId) {
  const board = document.getElementById(`ef-board-${containerId}`);
  if(!board) return;
  const boxes = {};
  board.querySelectorAll('.ef-node').forEach((node) => {
    const group = node.dataset.group || '未分组';
    const left = node.offsetLeft - EF_GROUP_PAD_X;
    const top = node.offsetTop - EF_GROUP_HEADER_H - EF_GROUP_PAD_Y;
    const right = node.offsetLeft + node.offsetWidth + EF_GROUP_PAD_X;
    const bottom = node.offsetTop + node.offsetHeight + EF_GROUP_PAD_Y;
    if(!boxes[group]) {
      boxes[group] = { left, top, right, bottom };
      return;
    }
    boxes[group].left = Math.min(boxes[group].left, left);
    boxes[group].top = Math.min(boxes[group].top, top);
    boxes[group].right = Math.max(boxes[group].right, right);
    boxes[group].bottom = Math.max(boxes[group].bottom, bottom);
  });
  board.querySelectorAll('.ef-group-frame').forEach((frame) => {
    const box = boxes[frame.dataset.group || '未分组'];
    if(!box) return;
    frame.style.left = `${box.left}px`;
    frame.style.top = `${box.top}px`;
    frame.style.width = `${box.right - box.left}px`;
    frame.style.height = `${box.bottom - box.top}px`;
  });
}

/* ── 节点拖拽（支持多选同步移动） ── */
function startEfNodeDrag(containerId, entityId, e) {
  e.preventDefault();
  efDragMoved = false;
  const entity = S.doc?.entities?.find(en => en.id === entityId);
  if(!entity) return;

  /* 拖动未选中节点时：清除旧选区，仅选中当前节点 */
  if(!efSelectedIds.has(entityId)) {
    efSelectedIds.clear();
    efSelectedIds.add(entityId);
    updateEfSelection(containerId);
  }

  /* 构建多节点拖拽映射 */
  const multiDrag = new Map();
  for(const eid of efSelectedIds) {
    const ent = S.doc?.entities?.find(en => en.id === eid);
    if(ent) multiDrag.set(eid, { entity: ent, origX: ent.pos?.x||0, origY: ent.pos?.y||0 });
  }

  efDragState = { containerId, multiDrag,
    startX: e.clientX, startY: e.clientY };
  document.addEventListener('mousemove', onEfNodeDrag);
  document.addEventListener('mouseup',   endEfNodeDrag);
}

function onEfNodeDrag(e) {
  if(!efDragState) return;
  const dx = e.clientX - efDragState.startX;
  const dy = e.clientY - efDragState.startY;
  if(Math.abs(dx) > 3 || Math.abs(dy) > 3) efDragMoved = true;
  if(!efDragMoved) return;
  let neededW = 0, neededH = 0;
  for(const [eid, info] of efDragState.multiDrag) {
    const newX = Math.max(0, info.origX + dx);
    const newY = Math.max(0, info.origY + dy);
    info.entity.pos = {x: newX, y: newY};
    const node = document.querySelector(
      `#ef-canvas-${efDragState.containerId} .ef-node[data-id="${eid}"]`);
    if(node) { node.style.left = newX+'px'; node.style.top = newY+'px'; }
    neededW = Math.max(neededW, newX + EF_NODE_W + 80);
    neededH = Math.max(neededH, newY + EF_NODE_H + 100);
  }
  const board = document.getElementById(`ef-board-${efDragState.containerId}`);
  const svgEl = document.getElementById(`ef-svg-${efDragState.containerId}`);
  if(board) {
    if(neededW > parseInt(board.style.width ||'0')) { board.style.width  = neededW+'px'; if(svgEl) svgEl.setAttribute('width',  neededW); }
    if(neededH > parseInt(board.style.height||'0')) { board.style.height = neededH+'px'; if(svgEl) svgEl.setAttribute('height', neededH); }
  }
  updateEfGroupFrames(efDragState.containerId);
  drawEfLines(efDragState.containerId, S.doc?.relations||[]);
}

function endEfNodeDrag(e) {
  if(!efDragState) return;
  document.removeEventListener('mousemove', onEfNodeDrag);
  document.removeEventListener('mouseup',   endEfNodeDrag);
  if(efDragMoved) markModified();
  efDragState = null;
  setTimeout(() => { efDragMoved = false; }, 80);
}

/* ── 背景平移（Pan）── */
function startEfPan(canvas, e) {
  /* 垂直溢出可能在父容器上（如 .live-diagram），水平溢出在 canvas 自身；
     同时记录两者的初始滚动位置，onEfPan 里一起更新。 */
  const parent = canvas.parentElement;
  efPanState = { canvas, parent,
    startX: e.clientX, startY: e.clientY,
    startSL: canvas.scrollLeft,  startST: canvas.scrollTop,
    startPSL: parent?.scrollLeft ?? 0, startPST: parent?.scrollTop ?? 0 };
  canvas.style.cursor = 'grabbing';
  document.addEventListener('mousemove', onEfPan);
  document.addEventListener('mouseup',   endEfPan);
}
function onEfPan(e) {
  if(!efPanState) return;
  const dx = e.clientX - efPanState.startX;
  const dy = e.clientY - efPanState.startY;
  /* 水平：滚动 canvas 自身 */
  efPanState.canvas.scrollLeft = efPanState.startSL  - dx;
  /* 垂直：先尝试 canvas 自身，若不能滚（无溢出）则滚父容器 */
  efPanState.canvas.scrollTop  = efPanState.startST  - dy;
  if(efPanState.parent) {
    efPanState.parent.scrollTop = efPanState.startPST - dy;
  }
}
function endEfPan() {
  if(!efPanState) return;
  efPanState.canvas.style.cursor = '';
  efPanState = null;
  document.removeEventListener('mousemove', onEfPan);
  document.removeEventListener('mouseup',   endEfPan);
}

/* ── 框选（Shift + 拖动背景）── */
function startEfRubber(containerId, canvas, e) {
  const board = document.getElementById(`ef-board-${containerId}`);
  if(!board) return;
  const cr = canvas.getBoundingClientRect();
  const bx = e.clientX - cr.left + canvas.scrollLeft;
  const by = e.clientY - cr.top  + canvas.scrollTop;
  efRubberEl = document.createElement('div');
  efRubberEl.className = 'ef-rubber';
  Object.assign(efRubberEl.style, { left: bx+'px', top: by+'px', width:'0', height:'0' });
  board.appendChild(efRubberEl);
  efRubberState = { containerId, canvas, board, bx0: bx, by0: by };
  document.addEventListener('mousemove', onEfRubber);
  document.addEventListener('mouseup',   endEfRubber);
}
function onEfRubber(e) {
  if(!efRubberState || !efRubberEl) return;
  const { canvas, bx0, by0 } = efRubberState;
  const cr = canvas.getBoundingClientRect();
  const bx1 = e.clientX - cr.left + canvas.scrollLeft;
  const by1 = e.clientY - cr.top  + canvas.scrollTop;
  efRubberState.bx1 = bx1; efRubberState.by1 = by1;
  const l = Math.min(bx0,bx1), t = Math.min(by0,by1);
  Object.assign(efRubberEl.style, { left:l+'px', top:t+'px',
    width: Math.abs(bx1-bx0)+'px', height: Math.abs(by1-by0)+'px' });
}
function endEfRubber() {
  if(!efRubberState) return;
  const { containerId, board, bx0, by0, bx1=bx0, by1=by0 } = efRubberState;
  const l=Math.min(bx0,bx1), t=Math.min(by0,by1),
        r=Math.max(bx0,bx1), b=Math.max(by0,by1);
  if(r-l > 4 || b-t > 4) {
    efSelectedIds.clear();
    board.querySelectorAll('.ef-node').forEach(node => {
      const nx=node.offsetLeft, ny=node.offsetTop,
            nw=node.offsetWidth, nh=node.offsetHeight;
      if(nx+nw > l && nx < r && ny+nh > t && ny < b) efSelectedIds.add(node.dataset.id);
    });
    updateEfSelection(containerId);
  }
  efRubberEl?.remove(); efRubberEl = null;
  efRubberState = null;
  document.removeEventListener('mousemove', onEfRubber);
  document.removeEventListener('mouseup',   endEfRubber);
}

function resetEfLayout() {
  if(!S.doc?.entities?.length) return;
  for(const e of S.doc.entities) delete e.pos;
  markModified();
  renderEntityDiagramNow();
}

function renderEntityFlow(containerId, doc, onClickMap) {
  const el = document.getElementById(containerId);
  if(!el) return;
  const entities  = doc?.entities||[];
  const relations = doc?.relations||[];
  if(!entities.length) {
    el.innerHTML = `<div class="diag-empty">暂无实体，点击上方"新建实体"</div>`;
    initZoom(containerId);
    return;
  }

  /* 确保每个实体都有 pos（首次打开时自动计算布局） */
  const defaultPosMap = _efComputeDefaultPos(entities, relations);
  for(const e of entities) {
    if(!e.pos) e.pos = defaultPosMap[e.id] || {x: EF_PAD, y: EF_PAD};
  }

  const focusEntityId = containerId === 'entity-diagram' ? S.ui.entityId : null;
  const focusRelatedIds = _efGetFocusRelatedIds(relations, focusEntityId);
  const groupFrames = _efComputeGroupFrames(entities);

  /* 颜色索引（原始 group 顺序保持颜色不变） */
  const grpMap = {};
  let ci = 0;
  for(const e of entities) {
    const g = e.group||'';
    if(!(g in grpMap)) { grpMap[g] = ci % ROLE_COLORS.length; ci++; }
  }

  /* 计算画板尺寸（容纳所有节点 + 留出 U 形弯道空间） */
  let boardW = 400, boardH = 200;
  for(const e of entities) {
    boardW = Math.max(boardW, (e.pos.x||0) + EF_NODE_W + 80);
    boardH = Math.max(boardH, (e.pos.y||0) + EF_NODE_H + 100);
  }
  for(const frame of groupFrames) {
    boardW = Math.max(boardW, frame.right + EF_PAD);
    boardH = Math.max(boardH, frame.bottom + EF_PAD);
  }

  const isDraggable = (containerId === 'entity-diagram');

  let h = `<div class="ef-canvas" id="ef-canvas-${containerId}">`;
  h += `<svg class="ef-svg" id="ef-svg-${containerId}" width="${boardW}" height="${boardH}"></svg>`;
  h += `<div class="ef-board" id="ef-board-${containerId}" style="width:${boardW}px;height:${boardH}px">`;

  for(const frame of groupFrames) {
    const idx = grpMap[frame.group === '未分组' ? '' : frame.group] ?? 0;
    const c = ROLE_COLORS[idx];
    h += `<div class="ef-group-frame" data-group="${esc(frame.group)}"
      style="left:${frame.left}px;top:${frame.top}px;width:${frame.right-frame.left}px;height:${frame.bottom-frame.top}px;
      --ef-group-fill:${c.fill}22;--ef-group-stroke:${c.stroke};">
      <div class="ef-group-title">${esc(frame.group)}</div>
    </div>`;
  }

  for(const e of entities) {
    const idx = grpMap[e.group||''];
    const c   = ROLE_COLORS[idx];
    const clickable = onClickMap?.[e.id] ? ' ef-clickable' : '';
    const draggable = isDraggable ? ' ef-draggable' : '';
    const focusCls = focusEntityId
      ? (e.id === focusEntityId ? ' ef-focus' : (focusRelatedIds.has(e.id) ? ' ef-neighbor' : ' ef-muted'))
      : '';
    h += `<div class="ef-node${clickable}${draggable}${focusCls}" data-id="${e.id}" data-group="${esc(e.group||'未分组')}"
      style="left:${e.pos.x}px;top:${e.pos.y}px;background:${c.fill};border-color:${c.stroke};color:${c.color}">`;
    h += `<span class="ef-nid">${esc(e.id)}</span>`;
    h += `<span class="ef-nname">${esc(e.name||e.id)}</span>`;
    h += `</div>`;
  }

  h += `</div></div>`; /* ef-board, ef-canvas */

  el.innerHTML = h;

  const canvas = document.getElementById(`ef-canvas-${containerId}`);

  /* ── 节点交互 ── */
  for(const e of entities) {
    const node = el.querySelector(`.ef-node[data-id="${e.id}"]`);
    if(!node) continue;
    if(onClickMap?.[e.id]) {
      node.addEventListener('click', ev => {
        if(efDragMoved) return;
        if(ev.ctrlKey || ev.metaKey) {
          /* Ctrl+点击：切换选中 */
          if(efSelectedIds.has(e.id)) efSelectedIds.delete(e.id);
          else efSelectedIds.add(e.id);
          updateEfSelection(containerId);
        } else {
          onClickMap[e.id]();
        }
      });
    }
    if(isDraggable) {
      node.addEventListener('mousedown', ev => {
        if(ev.ctrlKey || ev.metaKey) return; /* Ctrl+drag 不移动 */
        ev.stopPropagation();                /* 阻止冒泡到背景 */
        startEfNodeDrag(containerId, e.id, ev);
      });
    }
  }

  /* ── 背景交互：平移 or 框选 ── */
  if(canvas) {
    canvas.addEventListener('mousedown', ev => {
      if(ev.target !== canvas && !ev.target.classList.contains('ef-board')) return;
      ev.preventDefault();
      if(ev.shiftKey) {
        /* Shift+拖：框选 */
        startEfRubber(containerId, canvas, ev);
      } else {
        /* 普通拖：平移视口 */
        efSelectedIds.clear();
        updateEfSelection(containerId);
        startEfPan(canvas, ev);
      }
    });
  }

  /* 恢复选中状态的视觉显示（切换 tab 后重建 DOM 时保留） */
  updateEfSelection(containerId);

  initZoom(containerId);
  if(ZOOM[containerId] && ZOOM[containerId] !== 1) applyZoom(containerId);

  /* 等 DOM 渲染完后画连接线 */
  requestAnimationFrame(() => drawEfLines(containerId, relations));
}

function drawEfLines(containerId, relations) {
  const board = document.getElementById(`ef-board-${containerId}`);
  const svg   = document.getElementById(`ef-svg-${containerId}`);
  if(!board || !svg) return;
  const entityMap = new Map((S.doc?.entities||[]).map(entity => [entity.id, entity]));
  const focusEntityId = containerId === 'entity-diagram' ? S.ui.entityId : null;

  /* 节点矩形（board 坐标系，offsetLeft/offsetTop 直接可用） */
  function nr(id) {
    const el = board.querySelector(`.ef-node[data-id="${id}"]`);
    if(!el) return null;
    const l = el.offsetLeft, t = el.offsetTop;
    const w = el.offsetWidth, h = el.offsetHeight;
    return {l, t, r:l+w, b:t+h, cx:l+w/2, cy:t+h/2, w, h};
  }

  const rl = {'1:1':'1:1','1:N':'1:N','N:N':'N:N'};
  const markerId = `arr-${containerId.replace(/\W/g,'_')}`;

  /* 通道计数器，防止多条线重叠 */
  const chanCount = {};
  function chanIdx(key) { const i = chanCount[key]||0; chanCount[key]=i+1; return i; }

  const STROKE_COLORS = ['#3b82f6','#22c55e','#eab308','#ec4899','#8b5cf6','#f97316'];
  let pathsHtml = '';

  relations.forEach((rel, ri) => {
    const A = nr(rel.from), B = nr(rel.to);
    if(!A||!B) return;

    const color = STROKE_COLORS[ri % STROKE_COLORS.length];
    const lbl   = (rl[rel.type]||rel.type||'') + (rel.label ? ` ${rel.label}` : '');
    const fromGroup = entityMap.get(rel.from)?.group || '';
    const toGroup = entityMap.get(rel.to)?.group || '';
    const isCrossGroup = fromGroup !== toGroup;
    const isFocusRelation = !!focusEntityId && (rel.from === focusEntityId || rel.to === focusEntityId);
    const relationOpacity = focusEntityId ? (isFocusRelation ? 0.96 : 0.16) : (isCrossGroup ? 0.3 : 0.82);
    const relationWidth = focusEntityId ? (isFocusRelation ? 2.4 : 1.1) : (isCrossGroup ? 1.1 : 1.7);
    const dash  = (rel.type==='N:N' || isCrossGroup) ? 'stroke-dasharray="5,3"' : '';
    const labelOpacity = focusEntityId ? (isFocusRelation ? 0.98 : 0.14) : (isCrossGroup ? 0.4 : 0.78);

    let pathD, lx, ly;

    /* ── 自关联：从右侧出发画矩形小环，绕开节点本体 ── */
    if(rel.from === rel.to) {
      const idx     = chanIdx(`self-${rel.from}`);
      const loopW   = 28 + idx * 22;          /* 多条自关联向右依次展开 */
      const loopH   = Math.max(12, A.h / 3);  /* 环的半高，至少 12px */
      const exitY   = A.cy - loopH;           /* 从右侧偏上出发 */
      const enterY  = A.cy + loopH;           /* 从右侧偏下回入 */
      pathD = `M ${A.r} ${exitY} L ${A.r+loopW} ${exitY} L ${A.r+loopW} ${enterY} L ${A.r} ${enterY}`;
      lx = A.r + loopW + 4;
      ly = A.cy + 4;
      pathsHtml += `<path class="ef-rel${isCrossGroup?' ef-rel-cross':''}${isFocusRelation?' ef-rel-focus':''}${focusEntityId&&!isFocusRelation?' ef-rel-muted':''}"
        data-cross-group="${isCrossGroup}" data-related="${!focusEntityId || isFocusRelation}"
        d="${pathD}" stroke="${color}" stroke-width="${relationWidth}" stroke-opacity="${relationOpacity}" fill="none" ${dash} marker-end="url(#${markerId}-${ri})"/>`;
      if(lbl) pathsHtml += `<text x="${lx}" y="${ly}" text-anchor="start" font-size="10" fill="${color}" fill-opacity="${labelOpacity}">${esc(lbl)}</text>`;
      return;   /* 跳过后续通用路由 */
    }

    const dx    = B.cx - A.cx;
    const dy    = B.cy - A.cy;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    /* ── 场景1：同行（垂直差 < 节点高）→ 水平直线侧边连接 ── */
    if(absDy < EF_NODE_H + 4) {
      const key   = `h-${Math.round((A.cy + B.cy) / 2 / 8) * 8}`;
      const depth = chanIdx(key);
      /* 多条平行线上下错开 8px */
      const yOff  = (depth % 2 === 0 ? 1 : -1) * Math.ceil(depth / 2) * 8;
      const yCen  = (A.cy + B.cy) / 2 + yOff;

      if(dx >= 0) {
        /* A 在左，B 在右 */
        pathD = `M ${A.r} ${A.cy} L ${A.r+4} ${A.cy} L ${A.r+4} ${yCen} L ${B.l-4} ${yCen} L ${B.l-4} ${B.cy} L ${B.l} ${B.cy}`;
      } else {
        /* A 在右，B 在左 */
        pathD = `M ${A.l} ${A.cy} L ${A.l-4} ${A.cy} L ${A.l-4} ${yCen} L ${B.r+4} ${yCen} L ${B.r+4} ${B.cy} L ${B.r} ${B.cy}`;
      }
      lx = (A.cx + B.cx) / 2; ly = yCen - 8;

    /* ── 场景2：主方向垂直（|dy|>|dx|）→ 上下出边 L 形 ── */
    } else if(absDy >= absDx) {
      const goDown = dy > 0;
      const sy = goDown ? A.b : A.t;
      const ey = goDown ? B.t : B.b;
      const chanMid = (sy + ey) / 2;
      const key  = `v-${Math.round(Math.min(sy,ey))}-${Math.round(Math.max(sy,ey))}`;
      const idx  = chanIdx(key);
      const sign = idx % 2 === 0 ? 1 : -1;
      const yM   = chanMid + sign * Math.ceil(idx / 2) * 10;
      pathD = `M ${A.cx} ${sy} L ${A.cx} ${yM} L ${B.cx} ${yM} L ${B.cx} ${ey}`;
      lx = (A.cx + B.cx) / 2; ly = yM - 6;

    /* ── 场景3：主方向水平（|dx|>|dy|）→ 左右出边 L 形 ── */
    } else {
      const goRight = dx > 0;
      const sx = goRight ? A.r : A.l;
      const ex = goRight ? B.l : B.r;
      const chanMid = (sx + ex) / 2;
      const key  = `r-${Math.round(Math.min(sx,ex))}-${Math.round(Math.max(sx,ex))}`;
      const idx  = chanIdx(key);
      const sign = idx % 2 === 0 ? 1 : -1;
      const xM   = chanMid + sign * Math.ceil(idx / 2) * 10;
      pathD = `M ${sx} ${A.cy} L ${xM} ${A.cy} L ${xM} ${B.cy} L ${ex} ${B.cy}`;
      lx = xM + 8; ly = (A.cy + B.cy) / 2 - 4;
    }

    pathsHtml += `<path class="ef-rel${isCrossGroup?' ef-rel-cross':''}${isFocusRelation?' ef-rel-focus':''}${focusEntityId&&!isFocusRelation?' ef-rel-muted':''}"
      data-cross-group="${isCrossGroup}" data-related="${!focusEntityId || isFocusRelation}"
      d="${pathD}" stroke="${color}" stroke-width="${relationWidth}" stroke-opacity="${relationOpacity}" fill="none" ${dash} marker-end="url(#${markerId}-${ri})"/>`;
    if(lbl) pathsHtml += `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="10" fill="${color}" fill-opacity="${labelOpacity}">${esc(lbl)}</text>`;
  });

  const markerDefs = relations.map((rel,ri)=>{
    const color = STROKE_COLORS[ri%STROKE_COLORS.length];
    return `<marker id="${markerId}-${ri}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="${color}"/>
    </marker>`;
  }).join('');

  svg.innerHTML = `<defs>${markerDefs}</defs>${pathsHtml}`;
}

/* 实体图颜色：按主题域分配，无组的用第0色 */
function buildEntityMermaid(doc) {
  const entities = doc?.entities||[];
  if(!entities.length) return null;
  const relations = doc?.relations||[];

  /* 主题域 → 颜色索引 */
  const grpMap = {};
  let ci = 0;
  for(const e of entities) {
    const g = e.group||'';
    if(!(g in grpMap)) { grpMap[g] = ci % ROLE_COLORS.length; ci++; }
  }

  const lines = ['flowchart LR'];
  /* classDef */
  Object.values(grpMap).forEach(idx => {
    const c = ROLE_COLORS[idx];
    lines.push(`  classDef ec${idx} fill:${c.fill},stroke:${c.stroke},color:${c.color},stroke-width:2px`);
  });

  for(const e of entities) {
    const n   = (e.name||e.id).replace(/"/g,"'");
    const idx = grpMap[e.group||''];
    lines.push(`  ${e.id}["${n}"]:::ec${idx}`);
  }
  const rl = {'1:1':'1对1','1:N':'1对多','N:N':'多对多'};
  for(const r of relations) {
    const lbl = (rl[r.type]||r.type) + (r.label?`\\n${r.label}`:'');
    lines.push(`  ${r.from} -- "${lbl}" --> ${r.to}`);
  }
  return lines.join('\n');
}


function addEntity(group) {
  const id=nextId('E',S.doc.entities);
  S.doc.entities.push({id, name:'新实体', group:group||'', fields:[]});
  markModified(); navigate('data',{entityId:id});
}
function removeEntity(id) {
  if(!confirm('确认删除此实体？')) return;
  S.doc.entities=S.doc.entities.filter(e=>e.id!==id);
  S.doc.relations=(S.doc.relations||[]).filter(r=>r.from!==id&&r.to!==id);
  for(const proc of S.doc.processes)
    for(const task of (proc.tasks||[]))
      task.entity_ops=(task.entity_ops||[]).filter(eo=>eo.entity_id!==id);
  if(S.ui.entityId===id) S.ui.entityId=null;
  markModified(); render();
}
function setEntity(id,key,val) {
  const e=S.doc.entities.find(e=>e.id===id);
  if(e){e[key]=val; markModified();}
}

/* ── ID 重命名 ──────────────────────────────────────────── */
function renameProcessId(oldId, newId) {
  newId = newId.trim();
  if(!newId || newId === oldId) { render(); return; }
  if(S.doc.processes.some(p=>p.id===newId)) { alert(`流程ID "${newId}" 已存在`); render(); return; }
  const proc = S.doc.processes.find(p=>p.id===oldId); if(!proc) return;
  proc.id = newId;
  if(S.ui.procId === oldId) S.ui.procId = newId;
  markModified(); render();
}
function renameTaskId(procId, oldId, newId) {
  newId = newId.trim();
  if(!newId || newId === oldId) { render(); return; }
  const allTasks = S.doc.processes.flatMap(p=>p.tasks||[]);
  if(allTasks.some(t=>t.id===newId)) { alert(`任务ID "${newId}" 已存在`); render(); return; }
  const task = S.doc.processes.find(p=>p.id===procId)?.tasks?.find(t=>t.id===oldId); if(!task) return;
  task.id = newId;
  if(S.ui.taskId === oldId) S.ui.taskId = newId;
  markModified(); render();
}
function renameEntityId(oldId, newId) {
  newId = newId.trim();
  if(!newId || newId === oldId) { render(); return; }
  if(S.doc.entities.some(e=>e.id===newId)) { alert(`实体ID "${newId}" 已存在`); render(); return; }
  const entity = S.doc.entities.find(e=>e.id===oldId); if(!entity) return;
  entity.id = newId;
  for(const r of (S.doc.relations||[])) {
    if(r.from===oldId) r.from=newId;
    if(r.to  ===oldId) r.to  =newId;
  }
  for(const proc of S.doc.processes)
    for(const task of (proc.tasks||[]))
      for(const eo of (task.entity_ops||[]))
        if(eo.entity_id===oldId) eo.entity_id=newId;
  if(S.ui.entityId === oldId) S.ui.entityId = newId;
  markModified(); render();
}
/* 点击 ID 标签进入内联编辑 */
function startEditId(spanEl, type, ...args) {
  const curId = args[args.length-1];
  const input = document.createElement('input');
  input.type='text'; input.value=curId; input.className='id-edit-input';
  spanEl.replaceWith(input);
  input.focus(); input.select();
  let committed = false;
  function commit() {
    if(committed) return; committed=true;
    const v = input.value.trim();
    if(type==='proc')   renameProcessId(curId, v);
    else if(type==='task')   renameTaskId(args[0], curId, v);
    else if(type==='entity') renameEntityId(curId, v);
    else render();
  }
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e=>{
    if(e.key==='Enter')  { input.blur(); }
    if(e.key==='Escape') { committed=true; render(); }
  });
}

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Fields
═══════════════════════════════════════════════════════════ */
function addField(entityId) {
  const e=S.doc.entities.find(e=>e.id===entityId); if(!e) return;
  e.fields.push({name:'',type:'string',is_key:false,is_status:false,note:''});
  markModified(); render();
}
function removeField(entityId,idx) {
  const e=S.doc.entities.find(e=>e.id===entityId); if(!e) return;
  e.fields.splice(idx,1); markModified(); render();
}
function setField(entityId,idx,key,val) {
  const e=S.doc.entities.find(e=>e.id===entityId);
  if(e?.fields[idx]!==undefined){e.fields[idx][key]=val; markModified();}
}

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Relations
═══════════════════════════════════════════════════════════ */
function getRelationsForEntity(entityId) {
  return (S.doc.relations||[])
    .map((relation, index) => ({ relation, index }))
    .filter(({ relation }) => relation.from === entityId || relation.to === entityId);
}

function addRelation(entityId) {
  const ents=S.doc.entities||[];
  if(ents.length<2){alert('至少需要2个实体才能建立关系');return;}
  const baseEntityId = entityId || ents[0].id;
  const targetEntity = ents.find(e => e.id !== baseEntityId);
  if(!targetEntity) { alert('至少需要2个实体才能建立关系'); return; }
  S.doc.relations=S.doc.relations||[];
  S.doc.relations.push({from:baseEntityId,to:targetEntity.id,type:'1:N',label:''});
  markModified(); render();
}
function removeRelation(idx){S.doc.relations.splice(idx,1);markModified();render();}
function setRelation(idx,key,val){if(S.doc.relations[idx]){S.doc.relations[idx][key]=val;markModified();}}

function renderDataTab() {
  const entities=S.doc.entities||[];
  const entity=entities.find(e=>e.id===S.ui.entityId)||null;
  const drawerW = getDrawerWidth('entity');

  let h='';

  /* 实体关系图（全高） */
  h+=`<div class="live-diagram-wrap entity-diag-full" id="diagram-wrap">
    <div class="live-diagram-toolbar">
      <span class="live-diagram-hint">拖拽节点 · Ctrl+滚轮缩放 · 点击节点进入编辑</span>
      <button class="btn btn-outline btn-sm" onclick="addEntity()">＋ 新建实体</button>
      <button class="btn btn-ghost-sm" onclick="resetEfLayout()" title="清除手动布局，恢复分组布局">重置布局</button>
      <div class="zoom-controls">
        <button class="zoom-btn" onclick="zoomBy('entity-diagram',0.2)" title="放大">＋</button>
        <button class="zoom-btn" onclick="resetZoom('entity-diagram')" title="重置">⊙</button>
        <button class="zoom-btn" onclick="zoomBy('entity-diagram',-0.2)" title="缩小">－</button>
      </div>
    </div>
    <div id="entity-diagram" class="live-diagram" style="flex:1;overflow:auto"></div>
  </div>`;

  /* 右侧抽屉 */
  const relations=S.doc.relations||[];
  const scopedRelations=entity ? getRelationsForEntity(entity.id) : [];
  h+=`<div class="entity-drawer${entity?' open':''}" style="width:${drawerW}px">
    <div class="drawer-resize-handle" data-testid="entity-drawer-resize-handle" onmousedown="startDrawerResize(event)"></div>`;

  if(entity) {
    const refs=getTasksReferencingEntity(entity.id);

    h+=`<div class="drawer-head">
      <div class="drawer-crumb">
        <span class="detail-id editable-id" onclick="startEditId(this,'entity','${esc(entity.id)}')" title="点击编辑ID">${esc(entity.id)}</span>
        <span style="font-weight:600">${esc(entity.name||'未命名')}</span>
      </div>
      <div class="drawer-actions">
        <button class="btn btn-danger btn-sm" onclick="removeEntity('${esc(entity.id)}')">删除</button>
        <button class="drawer-close" onclick="navigate('data',{entityId:null})" title="关闭">✕</button>
      </div>
    </div>
    <div class="drawer-body">`;

    /* 基本信息 */
    h+=`<div class="form-grid" style="margin-bottom:16px">
      <div class="field-group">
        <label>实体名称</label>
        <input type="text" value="${esc(entity.name||'')}"
          oninput="setEntity('${esc(entity.id)}','name',this.value);renderSidebar();renderEntityDiagramNow()">
      </div>
      <div class="field-group">
        <label>主题域 <span class="section-hint">（侧边栏分组）</span></label>
        <input type="text" value="${esc(entity.group||'')}"
          placeholder="如：交易、履约"
          oninput="setEntity('${esc(entity.id)}','group',this.value);renderSidebar()">
      </div>
      <div class="field-group" style="grid-column:1/-1">
        <label>说明</label>
        <input type="text" value="${esc(entity.note||'')}"
          placeholder="简要说明"
          oninput="setEntity('${esc(entity.id)}','note',this.value)">
      </div>
    </div>`;

    /* 被引用 */
    if(refs.length){
      h+=`<div class="form-section"><h4>被以下任务引用</h4>
        <div class="task-ref-list">`;
      for(const {proc,task} of refs){
        h+=`<span class="task-ref"
          onclick="navigate('process',{procId:'${proc.id}',taskId:'${task.id}'})"
          title="跳转到任务">${esc(task.id)} ${esc(task.name)}</span>`;
      }
      h+=`</div></div>`;
    }

    /* 字段 */
    h+=`<div class="form-section">
      <h4>字段 <button class="btn btn-outline btn-sm" onclick="addField('${esc(entity.id)}')">＋</button></h4>`;
    if(entity.fields?.length){
      h+=`<table class="field-table">
        <thead><tr><th>字段名</th><th>类型</th><th title="主键">主键</th><th title="状态字段">状态</th><th>公式/约束</th><th></th></tr></thead>
        <tbody>`;
      entity.fields.forEach((f,i)=>{
        h+=`<tr>
          <td class="field-td-name"><input type="text" value="${esc(f.name||'')}" placeholder="字段名"
            oninput="setField('${esc(entity.id)}',${i},'name',this.value)"></td>
          <td class="field-td-type"><select onchange="setField('${esc(entity.id)}',${i},'type',this.value)">
            ${FIELD_TYPES.map(t=>`<option value="${t.value}" ${f.type===t.value?'selected':''}>${t.label}</option>`).join('')}
          </select></td>
          <td style="text-align:center"><input type="checkbox" ${f.is_key?'checked':''}
            onchange="setField('${esc(entity.id)}',${i},'is_key',this.checked)"></td>
          <td style="text-align:center"><input type="checkbox" ${f.is_status?'checked':''}
            onchange="setField('${esc(entity.id)}',${i},'is_status',this.checked)"></td>
          <td class="field-td-note"><textarea class="auto-resize" rows="1" placeholder="公式 / 约束"
            oninput="setField('${esc(entity.id)}',${i},'note',this.value);autoResize(this)"
            >${esc(f.note||'')}</textarea></td>
          <td><button class="field-del" onclick="removeField('${esc(entity.id)}',${i})">✕</button></td>
        </tr>`;
      });
      h+=`</tbody></table>`;
    } else { h+=`<p class="no-refs">暂无字段</p>`; }
    h+=`</div>`;

    /* 实体关系 */
    h+=`<div class="form-section">
      <h4>实体关系 <button class="btn btn-outline btn-sm" onclick="addRelation('${esc(entity.id)}')">＋</button></h4>
      <p class="rel-scope-tip">仅显示与当前实体直接相关的关系，减少全局噪音。</p>`;
    if(scopedRelations.length){
      h+=`<div class="rel-list" data-testid="entity-relation-list">`;
      scopedRelations.forEach(({relation:r,index:i})=>{
        h+=`<div class="rel-row">
          <select onchange="setRelation(${i},'from',this.value)">
            ${entities.map(e=>`<option value="${e.id}" ${r.from===e.id?'selected':''}>${e.id} ${esc(e.name)}</option>`).join('')}
          </select>
          <select style="width:76px" onchange="setRelation(${i},'type',this.value)">
            ${['1:1','1:N','N:N'].map(t=>`<option ${r.type===t?'selected':''}>${t}</option>`).join('')}
          </select>
          <select onchange="setRelation(${i},'to',this.value)">
            ${entities.map(e=>`<option value="${e.id}" ${r.to===e.id?'selected':''}>${e.id} ${esc(e.name)}</option>`).join('')}
          </select>
          <input type="text" value="${esc(r.label||'')}" placeholder="关系说明"
            oninput="setRelation(${i},'label',this.value)" style="width:90px">
          <button class="btn-icon" onclick="removeRelation(${i})">✕</button>
        </div>`;
      });
      h+=`</div>`;
    } else { h+=`<p class="no-refs">当前实体暂无关系</p>`; }
    h+=`</div>`;

    h+=`</div>`; /* drawer-body */
  } else {
    h+=`<div class="drawer-empty"><p>点击实体节点打开编辑</p></div>`;
  }

  h+=`</div>`; /* entity-drawer */

  document.getElementById('tab-content').innerHTML=h;

  /* 渲染实体图 */
  const clickMap={};
  for(const e of entities)
    clickMap[e.id]=()=>navigate('data',{entityId:e.id});
  renderEntityFlow('entity-diagram', S.doc, clickMap);
}

function renderEntityDiagramNow() {
  const clickMap={};
  for(const e of (S.doc.entities||[]))
    clickMap[e.id]=()=>navigate('data',{entityId:e.id});
  renderEntityFlow('entity-diagram', S.doc, clickMap);
}

/* ── 步骤类型：自定义支持 ── */
