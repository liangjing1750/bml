'use strict';

/* ═══════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════ */
const S = {
  files: [],
  currentFile: null,
  doc: null,
  modified: false,
  ui: {
    tab: 'domain',
    procId: null, taskId: null,
    entityId: null,
    sbCollapse: {},   // { 'proc-P1': true, 'grp-销售': false }
    sidebarCollapsed: false,
    procView: 'list'  // 'list' | 'card'
  }
};

/* ═══════════════════════════════════════════════════════════
   API
═══════════════════════════════════════════════════════════ */
const api = {
  async files()         { return fetch('/api/files').then(r => r.json()); },
  async load(name)      { return fetch(`/api/load/${encodeURIComponent(name)}`).then(r => r.json()); },
  async save(name, doc) {
    return fetch(`/api/save/${encodeURIComponent(name)}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(doc)
    }).then(r => r.json());
  },
  async create(name) {
    return fetch('/api/new', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})
    }).then(r => r.json());
  },
  async del(name) {
    return fetch(`/api/delete/${encodeURIComponent(name)}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'
    }).then(r => r.json());
  },
  async exportMd(name) { return fetch(`/api/export/${encodeURIComponent(name)}`).then(r => r.text()); }
};

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════ */
const STEP_TYPES = [
  {value:'Query',  label:'查询'}, {value:'Check',  label:'校验'},
  {value:'Fill',   label:'填写'}, {value:'Select', label:'选择'},
  {value:'Compute',label:'计算'}, {value:'Mutate', label:'变更'},
  {value:'__other__', label:'其它…'},
];
const FIELD_TYPES = [
  {value:'string',  label:'字符'},  {value:'number',  label:'数值'},
  {value:'decimal', label:'金额'},  {value:'date',    label:'日期'},
  {value:'datetime',label:'日期时间'},{value:'boolean',label:'布尔'},
  {value:'enum',   label:'枚举'},   {value:'text',    label:'长文本'},
  {value:'id',     label:'标识ID'},
];

/* ═══════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════ */
function nextId(prefix, items) {
  const used = new Set((items||[]).map(x=>x.id));
  let i=1; while(used.has(`${prefix}${i}`))i++;
  return `${prefix}${i}`;
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
/* textarea 自动撑高：绑定在 oninput 或渲染后调用 */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight) + 'px';
}
/* 渲染完后批量撑高页面内所有 auto-resize textarea */
function initAutoResize() {
  document.querySelectorAll('textarea.auto-resize').forEach(autoResize);
}
function markModified() {
  if (!S.modified) {
    S.modified = true;
    document.getElementById('modified-dot')?.classList.remove('hidden');
  }
}
function getEntityName(id) { return S.doc?.entities?.find(e=>e.id===id)?.name||id; }
function currentProc()  { return (S.doc?.processes||[]).find(p=>p.id===S.ui.procId)||null; }
function currentTask()  { return currentProc()?.tasks?.find(t=>t.id===S.ui.taskId)||null; }
function getRoles()     { return S.doc?.roles||[]; }

function getTasksReferencingEntity(entityId) {
  const result=[];
  for(const proc of (S.doc?.processes||[])) {
    for(const task of (proc.tasks||[])) {
      if((task.entity_ops||[]).some(eo=>eo.entity_id===entityId))
        result.push({proc,task});
    }
  }
  return result;
}

/* ═══════════════════════════════════════════════════════════
   MERMAID HELPERS
═══════════════════════════════════════════════════════════ */
/* 6色循环色板（pastel，不刺眼） */
const ROLE_COLORS = [
  { fill:'#dbeafe', stroke:'#3b82f6', color:'#1e3a8a' }, // 蓝
  { fill:'#dcfce7', stroke:'#22c55e', color:'#14532d' }, // 绿
  { fill:'#fef9c3', stroke:'#eab308', color:'#713f12' }, // 黄
  { fill:'#fce7f3', stroke:'#ec4899', color:'#831843' }, // 粉
  { fill:'#ede9fe', stroke:'#8b5cf6', color:'#3b0764' }, // 紫
  { fill:'#ffedd5', stroke:'#f97316', color:'#7c2d12' }, // 橙
];

/* buildProcMermaid：仅用于 MD 预览/导出，保持简洁的线性流程图 */
function buildProcMermaid(proc) {
  const tasks = proc?.tasks||[];
  if(!tasks.length) return null;

  const roleMap = {};
  let colorIdx = 0;
  for(const t of tasks) {
    const r = t.role||'';
    if(!(r in roleMap)) { roleMap[r] = colorIdx % ROLE_COLORS.length; colorIdx++; }
  }

  const lines = ['flowchart LR'];
  Object.values(roleMap).forEach(idx => {
    const c = ROLE_COLORS[idx];
    lines.push(`  classDef rc${idx} fill:${c.fill},stroke:${c.stroke},color:${c.color},stroke-width:2px`);
  });
  lines.push('  classDef startEnd fill:#f1f5f9,stroke:#94a3b8,color:#475569');
  lines.push('  classDef entTag fill:#f8fafc,stroke:#cbd5e1,color:#64748b,font-size:11px');
  lines.push('  Start([开始]):::startEnd');

  for(const t of tasks) {
    const name = (t.name||'').replace(/"/g,"'");
    const repeat = t.repeatable ? ' ↺' : '';
    let label = `${name}${repeat}`;
    if(t.role) label += `\\n(${t.role})`;
    const ci = roleMap[t.role||''];
    lines.push(`  ${t.id}["${label}"]:::rc${ci}`);
    /* 实体标签：横向附注（MD 导出用，不影响 app 内实时图） */
    const eops = (t.entity_ops||[]).filter(eo=>eo.ops?.length);
    if(eops.length) {
      const tag = eops.map(eo=>`${getEntityName(eo.entity_id).replace(/"/g,"'")}·${(eo.ops||[]).join('')}`).join('  ');
      lines.push(`  et_${t.id}(["${tag}"]):::entTag`);
      lines.push(`  ${t.id} -.-> et_${t.id}`);
    }
  }

  lines.push('  End([结束]):::startEnd');
  lines.push('  '+['Start',...tasks.map(t=>t.id),'End'].join(' --> '));
  return lines.join('\n');
}

/* ═══════════════════════════════════════════════════════════
   PROCESS FLOW — 自定义 HTML 渲染器（不依赖 Mermaid）
   布局：任务横向直线 + 实体在任务正下方垂直虚线连接
═══════════════════════════════════════════════════════════ */
function renderProcFlow(containerId, proc, onClickMap) {
  const el = document.getElementById(containerId);
  if(!el) return;
  const tasks = proc?.tasks||[];
  if(!tasks.length) { el.innerHTML=`<div class="diag-empty">暂无任务，点击上方"添加任务"</div>`; initZoom(containerId); return; }

  /* 角色→颜色 */
  const roleMap = {};
  let ci = 0;
  for(const t of tasks) {
    const r = t.role||'';
    if(!(r in roleMap)) roleMap[r] = ci++ % ROLE_COLORS.length;
  }

  let h = '<div class="pf-wrap">';
  h += `<div class="pf-se">开始</div>`;

  for(const t of tasks) {
    const idx = roleMap[t.role||''];
    const c   = ROLE_COLORS[idx];
    const eops = (t.entity_ops||[]).filter(eo=>eo.ops?.length);
    const repeat = t.repeatable ? `<span class="pf-repeat"> ↺</span>` : '';
    const clickable = onClickMap?.[t.id] ? ' pf-clickable' : '';

    h += `<div class="pf-arrow">→</div>`;
    h += `<div class="pf-col" data-id="${t.id}">`;
    /* 任务节点 */
    h += `<div class="pf-task${clickable}" data-id="${t.id}"
      style="background:${c.fill};border-color:${c.stroke};color:${c.color}">`;
    h += `<div class="pf-tn">${esc(t.name||'')}${repeat}</div>`;
    if(t.role) h += `<div class="pf-tr">(${esc(t.role)})</div>`;
    h += `</div>`;
    /* 实体标签（正下方） */
    if(eops.length) {
      h += `<div class="pf-vline"></div>`;
      h += `<div class="pf-tags">`;
      for(const eo of eops) {
        const en  = getEntityName(eo.entity_id);
        const ops = (eo.ops||[]).join('');
        h += `<span class="pf-tag">${esc(en)}·${esc(ops)}</span>`;
      }
      h += `</div>`;
    }
    h += `</div>`; /* pf-col */
  }

  h += `<div class="pf-arrow">→</div>`;
  h += `<div class="pf-se">结束</div>`;
  h += '</div>';

  el.innerHTML = h;

  /* 绑定点击 */
  if(onClickMap) {
    for(const [taskId, handler] of Object.entries(onClickMap)) {
      const node = el.querySelector(`.pf-task[data-id="${taskId}"]`);
      if(node) { node.style.cursor='pointer'; node.addEventListener('click', handler); }
    }
  }

  /* 流程图背景拖动平移（mousedown 在 .pf-wrap 空白处） */
  el.addEventListener('mousedown', ev => {
    if(ev.target.closest('.pf-task,.pf-tag,.pf-se')) return;
    ev.preventDefault();
    startEfPan(el, ev);
  });

  initZoom(containerId);
  if(ZOOM[containerId] && ZOOM[containerId]!==1) applyZoom(containerId);
}

/* ═══════════════════════════════════════════════════════════
   ENTITY FLOW — 自定义 HTML swimlane 渲染（不依赖 Mermaid）
   布局：每个 group 一行（swimlane），SVG overlay 画关系线
═══════════════════════════════════════════════════════════ */
/* ── ER 图工具函数 ──────────────────────────────────────── */
/* 按连通度排序实体（组内连接多的靠前），并按跨组连接数排序组顺序 */
function _efSortLayout(entities, relations) {
  const deg = {};  // entity id → degree
  for(const e of entities) deg[e.id] = 0;
  for(const r of relations) {
    if(deg[r.from]!==undefined) deg[r.from]++;
    if(deg[r.to]  !==undefined) deg[r.to]++;
  }

  // 组间连接权重（用于排序组顺序，让关联紧密的组相邻）
  const grpScore = {};
  for(const e of entities) { const g=e.group||''; grpScore[g]=(grpScore[g]||0)+deg[e.id]; }

  const allGroups = [...new Set(entities.map(e=>e.group||''))];
  allGroups.sort((a,b)=>(grpScore[b]||0)-(grpScore[a]||0));

  // 组内实体按度排序（度高的放中间——先排序后放中间位置）
  const sorted = [];
  for(const grp of allGroups) {
    const ge = entities.filter(e=>(e.group||'')=== grp)
                       .sort((a,b)=>(deg[b.id]||0)-(deg[a.id]||0));
    sorted.push({grp, entities: ge});
  }
  return sorted;
}

/* ── ER 图节点默认布局计算 ── */
const EF_NODE_W = 120;   // 预估节点宽
const EF_NODE_H = 38;    // 预估节点高
const EF_GAP_X  = 40;    // 同行间距
const EF_GAP_Y  = 70;    // 行间距
const EF_PAD    = 20;    // 边距

/* 辐射布局：连接数最多的实体居中，其余按连通度排序向外散布 */
function _efComputeDefaultPos(entities, relations) {
  if(!entities.length) return {};

  const deg = {};
  for(const e of entities) deg[e.id] = 0;
  for(const r of relations) {
    if(deg[r.from]!==undefined) deg[r.from]++;
    if(deg[r.to]  !==undefined) deg[r.to]++;
  }

  /* 按连接数降序排列 */
  const sorted = [...entities].sort((a,b)=>(deg[b.id]||0)-(deg[a.id]||0));
  const n = sorted.length;
  const posMap = {};

  /* 计算每圈容量（保证节点间距 ≥ 140px）*/
  const rings = [];
  let radius = 0, placed = 0;
  while(placed < n) {
    const cap = radius === 0 ? 1 : Math.max(1, Math.floor(2 * Math.PI * radius / 145));
    const take = Math.min(cap, n - placed);
    rings.push({radius, take});
    placed += take;
    radius += 160;
    if(radius > 1200) break; // safety
  }

  /* 圆心坐标 */
  const maxR = rings[rings.length-1]?.radius || 0;
  const cx   = maxR + EF_NODE_W  + EF_PAD * 3;
  const cy   = maxR + EF_NODE_H  + EF_PAD * 3;

  let idx = 0;
  for(const {radius: r, take} of rings) {
    for(let i = 0; i < take; i++, idx++) {
      const e = sorted[idx];
      if(r === 0) {
        posMap[e.id] = {x: cx - EF_NODE_W/2, y: cy - EF_NODE_H/2};
      } else {
        const angle = (i / take) * 2 * Math.PI - Math.PI / 2;
        posMap[e.id] = {
          x: Math.round(cx + r * Math.cos(angle) - EF_NODE_W/2),
          y: Math.round(cy + r * Math.sin(angle) - EF_NODE_H/2)
        };
      }
    }
  }
  return posMap;
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

  const isDraggable = (containerId === 'entity-diagram');

  let h = `<div class="ef-canvas" id="ef-canvas-${containerId}">`;
  h += `<svg class="ef-svg" id="ef-svg-${containerId}" width="${boardW}" height="${boardH}"></svg>`;
  h += `<div class="ef-board" id="ef-board-${containerId}" style="width:${boardW}px;height:${boardH}px">`;

  for(const e of entities) {
    const idx = grpMap[e.group||''];
    const c   = ROLE_COLORS[idx];
    const clickable = onClickMap?.[e.id] ? ' ef-clickable' : '';
    const draggable = isDraggable ? ' ef-draggable' : '';
    h += `<div class="ef-node${clickable}${draggable}" data-id="${e.id}"
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
    const dash  = rel.type==='N:N' ? 'stroke-dasharray="5,3"' : '';

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
      pathsHtml += `<path d="${pathD}" stroke="${color}" stroke-width="1.5" fill="none" ${dash} marker-end="url(#${markerId}-${ri})"/>`;
      if(lbl) pathsHtml += `<text x="${lx}" y="${ly}" text-anchor="start" font-size="10" fill="${color}">${esc(lbl)}</text>`;
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

    pathsHtml += `<path d="${pathD}" stroke="${color}" stroke-width="1.5" fill="none" ${dash} marker-end="url(#${markerId}-${ri})"/>`;
    if(lbl) pathsHtml += `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="10" fill="${color}">${esc(lbl)}</text>`;
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

/* ═══════════════════════════════════════════════════════════
   ZOOM
   原理：读取 SVG viewBox 得到自然尺寸，通过修改 width/height 属性缩放。
   Mermaid 会给 SVG 加 style="max-width:...;height:auto"，必须先清除。
═══════════════════════════════════════════════════════════ */
const ZOOM = {};

/* ── Card Map 常量 ── */
const CARD_W = 300;
const CARD_H = 200;
const OV_CARD_W = 180;
const OV_CARD_H = 72;
function _cardGridW() { return S.ui.procView === 'list' ? OV_CARD_W : CARD_W; }
function _cardGridH() { return S.ui.procView === 'list' ? OV_CARD_H : CARD_H; }
let dragState = null;

function _captureSvgSize(svg) {
  /* 去掉 Mermaid 的 max-width 约束，记录 SVG 自然尺寸 */
  svg.style.maxWidth = 'none';
  const vb = svg.getAttribute('viewBox');
  if(vb) {
    const p = vb.trim().split(/\s+/).map(Number);
    svg._zW = p[2] || 600;
    svg._zH = p[3] || 200;
  } else {
    svg._zW = parseFloat(svg.getAttribute('width'))  || 600;
    svg._zH = parseFloat(svg.getAttribute('height')) || 200;
  }
}

function applyZoom(id) {
  const el = document.getElementById(id);
  if(!el) return;
  const s = ZOOM[id]||1;
  /* Entity Flow HTML diagram（绝对定位画板 + SVG overlay） */
  const efBoard = el.querySelector('.ef-board');
  if(efBoard) {
    /* 用 transform:scale 同时缩放 board 和 SVG，保持节点与线对齐 */
    const tfm = s === 1 ? '' : `scale(${s})`;
    efBoard.style.transformOrigin = '0 0';
    efBoard.style.transform = tfm;
    const efSvg = el.querySelector('.ef-svg');
    if(efSvg) { efSvg.style.transformOrigin = '0 0'; efSvg.style.transform = tfm; }
    const relations = S.doc?.relations||[];
    requestAnimationFrame(() => drawEfLines(id, relations));
    return;
  }
  /* Mermaid SVG（实体关系图等）— only when no ef-canvas present */
  const svg = el.querySelector('svg');
  if(svg && !el.querySelector('.ef-canvas')) {
    if(!svg._zW) _captureSvgSize(svg);
    svg.setAttribute('width',  Math.round(svg._zW * s));
    svg.setAttribute('height', Math.round(svg._zH * s));
    return;
  }
  /* 自定义 HTML 流程图（pf-wrap），用 CSS zoom 属性（影响布局，容器会出现滚动条） */
  const wrap = el.querySelector('.pf-wrap');
  if(wrap) wrap.style.zoom = String(s);
}

function zoomBy(id, delta) {
  ZOOM[id] = Math.max(0.3, Math.min(4, (ZOOM[id]||1) + delta));
  applyZoom(id);
}
function resetZoom(id) { ZOOM[id] = 1; applyZoom(id); }

function initZoom(id) {
  const el  = document.getElementById(id);
  if(!el) return;
  /* 每次渲染后刷新 SVG 自然尺寸（SVG DOM 已替换；跳过 ef-canvas overlay SVG） */
  const svg = el.querySelector('svg');
  if(svg && !el.querySelector('.ef-canvas')) _captureSvgSize(svg);
  /* 只绑定一次 wheel 监听（el 不变时复用） */
  if(el._zoomBound) return;
  el._zoomBound = true;
  el.addEventListener('wheel', e => {
    if(!e.ctrlKey) return;
    e.preventDefault();
    zoomBy(id, e.deltaY < 0 ? 0.15 : -0.15);
  }, {passive: false});
}


async function renderDiagram(containerId, code, onClickMap) {
  const el = document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = '';
  if(!code) {
    el.innerHTML = `<div class="diag-empty">暂无内容</div>`;
    return;
  }
  if(!window.mermaidLib) {
    el.innerHTML = `<div class="diag-empty">图表需联网加载 Mermaid CDN</div>`;
    return;
  }
  try {
    const {svg} = await window.mermaidLib.render('d'+Date.now(), code);
    el.innerHTML = svg;
    initZoom(containerId);   /* 先捕获 SVG 自然尺寸，绑定滚轮 */
    if(ZOOM[containerId] && ZOOM[containerId]!==1) applyZoom(containerId); /* 再恢复缩放 */
    if(onClickMap) {
      for(const [nodeId, handler] of Object.entries(onClickMap)) {
        // Mermaid v10 generates g elements with id like "flowchart-T1-N"
        const nodes = el.querySelectorAll(`[id*="flowchart-${nodeId}-"],[id="${nodeId}"]`);
        nodes.forEach(n => {
          n.style.cursor='pointer';
          n.addEventListener('click', handler);
        });
      }
    }
  } catch(e) {
    el.innerHTML = `<div class="diag-empty" style="color:var(--danger)">图表渲染错误</div>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════════════ */
function navigate(tab, opts) {
  S.ui.tab = tab;
  if(opts) {
    if('procId'   in opts) S.ui.procId   = opts.procId;
    if('taskId'   in opts) S.ui.taskId   = opts.taskId;
    if('entityId' in opts) S.ui.entityId = opts.entityId;
  }
  render();
}

function toggleCollapse(key) {
  S.ui.sbCollapse[key] = !S.ui.sbCollapse[key];
  renderSidebar();
}

/* 业务域 Tab 内的卡片折叠（不影响侧边栏） */
function toggleDomainSection(key) {
  S.ui.sbCollapse[key] = !S.ui.sbCollapse[key];
  renderDomainTab();
}

function toggleSidebar() {
  S.ui.sidebarCollapsed = !S.ui.sidebarCollapsed;
  renderSidebar();
}

function setProcView(v) {
  S.ui.procView = v;
  renderProcessTab();
}

/* ── 概要视图：拖拽排序 ── */
let _plDragId = null;
function procListDragStart(e, id) {
  _plDragId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('pl-dragging');
}
function procListDragOver(e, id) {
  e.preventDefault();
  if(_plDragId === id) return;
  document.querySelectorAll('.proc-list-item').forEach(el => el.classList.remove('pl-over'));
  e.currentTarget.classList.add('pl-over');
}
function procListDragLeave(e) { e.currentTarget.classList.remove('pl-over'); }
function procListDrop(e, targetId) {
  e.preventDefault();
  e.currentTarget.classList.remove('pl-over');
  if(!_plDragId || _plDragId === targetId) { _plDragId = null; return; }
  const procs = S.doc.processes;
  const fi = procs.findIndex(p => p.id === _plDragId);
  const ti = procs.findIndex(p => p.id === targetId);
  if(fi < 0 || ti < 0) { _plDragId = null; return; }
  const [moved] = procs.splice(fi, 1);
  procs.splice(ti, 0, moved);
  _plDragId = null;
  markModified();
  renderSidebar();
  renderProcessTab();
}

/* ── 侧边栏移动：流程（同业务子域内上下移） ── */
function moveProcInSd(procId, dir, e) {
  if(e) e.stopPropagation();
  const procs = S.doc.processes;
  const proc = procs.find(p=>p.id===procId); if(!proc) return;
  const sd = proc.subDomain||'';
  const sdList = procs.filter(p=>(p.subDomain||'')===sd);
  const idx = sdList.findIndex(p=>p.id===procId);
  const nidx = idx + dir;
  if(nidx < 0 || nidx >= sdList.length) return;
  const fi = procs.indexOf(sdList[idx]);
  const ti = procs.indexOf(sdList[nidx]);
  [procs[fi], procs[ti]] = [procs[ti], procs[fi]];
  markModified(); renderSidebar(); renderProcessTab();
}

/* ── 侧边栏移动：业务子域（整组移） ── */
function moveSdGroup(sd, dir, e) {
  if(e) e.stopPropagation();
  const procs = S.doc.processes;
  const sds = [...new Set(procs.map(p=>p.subDomain||''))];
  const idx = sds.indexOf(sd);
  const nidx = idx + dir;
  if(nidx < 0 || nidx >= sds.length) return;
  const blocks = sds.map(s => procs.filter(p=>(p.subDomain||'')===s));
  [blocks[idx], blocks[nidx]] = [blocks[nidx], blocks[idx]];
  S.doc.processes = blocks.flat();
  markModified(); renderSidebar(); renderProcessTab();
}

/* ── 侧边栏移动：实体（同主题域内上下移） ── */
function moveEntityInGrp(entityId, dir, e) {
  if(e) e.stopPropagation();
  const ents = S.doc.entities;
  const ent = ents.find(en=>en.id===entityId); if(!ent) return;
  const grp = ent.group||'';
  const grpList = ents.filter(en=>(en.group||'')===grp);
  const idx = grpList.findIndex(en=>en.id===entityId);
  const nidx = idx + dir;
  if(nidx < 0 || nidx >= grpList.length) return;
  const fi = ents.indexOf(grpList[idx]);
  const ti = ents.indexOf(grpList[nidx]);
  [ents[fi], ents[ti]] = [ents[ti], ents[fi]];
  markModified(); renderSidebar();
}

/* ── 侧边栏移动：主题域（整组移） ── */
function moveGrpGroup(grp, dir, e) {
  if(e) e.stopPropagation();
  const ents = S.doc.entities;
  const grps = [...new Set(ents.map(en=>en.group||''))];
  const idx = grps.indexOf(grp);
  const nidx = idx + dir;
  if(nidx < 0 || nidx >= grps.length) return;
  const blocks = grps.map(g => ents.filter(en=>(en.group||'')===g));
  [blocks[idx], blocks[nidx]] = [blocks[nidx], blocks[idx]];
  S.doc.entities = blocks.flat();
  markModified(); renderSidebar();
}

function _defaultSbCollapse(doc) {
  const c = { lang: true }; /* 统一语言默认折叠 */
  (doc.processes||[]).forEach(p => { c[`proc-${p.id}`] = true; });
  return c;
}

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Meta / Domain (domain IS the filename)
═══════════════════════════════════════════════════════════ */
function setDomain(val) {
  if(!S.doc) return;
  S.doc.meta.domain = val;
  S.doc.meta.title  = val;   // title mirrors domain
  markModified();
  document.getElementById('file-name').textContent = val || '未命名';
}

function setMeta(key, val) { if(S.doc){S.doc.meta[key]=val; markModified();} }

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Roles
═══════════════════════════════════════════════════════════ */
function addRole() {
  const inp = document.getElementById('role-input');
  const role = (inp?.value||'').trim();
  if(!role) return;
  if(!S.doc.roles) S.doc.roles=[];
  if(!S.doc.roles.includes(role)){S.doc.roles.push(role); markModified(); render();}
  if(inp) inp.value='';
}
function removeRole(idx) { S.doc.roles.splice(idx,1); markModified(); render(); }

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Language
═══════════════════════════════════════════════════════════ */
function addTerm()            { S.doc.language.push({term:'',definition:''}); markModified(); render(); }
function removeTerm(idx)      { S.doc.language.splice(idx,1); markModified(); render(); }
function setTerm(idx,k,val)   { S.doc.language[idx][k]=val; markModified(); }

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Processes
═══════════════════════════════════════════════════════════ */
function addProcess(subDomain) {
  const id  = nextId('P', S.doc.processes);
  const pos = _nextFreePos(S.doc.processes, null); /* 自动填补空缺格子 */
  S.doc.processes.push({id, name:'新流程', subDomain:subDomain||'', trigger:'', outcome:'', tasks:[], pos});
  markModified();
  navigate('process',{procId:id, taskId:null});
}
function removeProcess(id) {
  if(!confirm('确认删除此流程及所有任务？')) return;
  S.doc.processes = S.doc.processes.filter(p=>p.id!==id);
  if(S.ui.procId===id){S.ui.procId=S.doc.processes[0]?.id||null; S.ui.taskId=null;}
  markModified(); render();
}
function setProc(procId,key,val) {
  const p=S.doc.processes.find(p=>p.id===procId);
  if(p){p[key]=val; markModified();}
}

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Tasks
═══════════════════════════════════════════════════════════ */
function addTask(procId) {
  const proc=S.doc.processes.find(p=>p.id===procId); if(!proc) return;
  const allTasks=S.doc.processes.flatMap(p=>p.tasks||[]);
  const id=nextId('T',allTasks);
  proc.tasks.push({id, name:'新任务', role:'', steps:[], entity_ops:[], repeatable:false});
  markModified();
  navigate('process',{procId, taskId:id});
}
function removeTask(procId,taskId) {
  const proc=S.doc.processes.find(p=>p.id===procId); if(!proc) return;
  proc.tasks=proc.tasks.filter(t=>t.id!==taskId);
  if(S.ui.taskId===taskId) S.ui.taskId=null;
  markModified(); render();
}
function moveTask(procId,taskId,dir) {
  const proc=S.doc.processes.find(p=>p.id===procId); if(!proc) return;
  const idx=proc.tasks.findIndex(t=>t.id===taskId);
  const nidx=idx+dir;
  if(nidx<0||nidx>=proc.tasks.length) return;
  [proc.tasks[idx],proc.tasks[nidx]]=[proc.tasks[nidx],proc.tasks[idx]];
  markModified(); render();
}
function setTask(procId,taskId,key,val) {
  const t=S.doc.processes.find(p=>p.id===procId)?.tasks?.find(t=>t.id===taskId);
  if(t){t[key]=val; markModified();}
}

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Steps
═══════════════════════════════════════════════════════════ */
function addStep(procId,taskId) {
  const t=S.doc.processes.find(p=>p.id===procId)?.tasks?.find(t=>t.id===taskId);
  if(!t) return;
  t.steps.push({name:'',type:'Query',note:''}); markModified(); render();
}
function removeStep(procId,taskId,idx) {
  const t=S.doc.processes.find(p=>p.id===procId)?.tasks?.find(t=>t.id===taskId);
  if(!t) return; t.steps.splice(idx,1); markModified(); render();
}
function setStep(procId,taskId,idx,key,val) {
  const t=S.doc.processes.find(p=>p.id===procId)?.tasks?.find(t=>t.id===taskId);
  if(t?.steps[idx]!==undefined){t.steps[idx][key]=val; markModified();}
}

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Entity Ops
═══════════════════════════════════════════════════════════ */
function addEntityOp(procId,taskId,entityId) {
  if(!entityId) return;
  const t=S.doc.processes.find(p=>p.id===procId)?.tasks?.find(t=>t.id===taskId);
  if(!t) return;
  if(!t.entity_ops) t.entity_ops=[];
  if(t.entity_ops.some(eo=>eo.entity_id===entityId)) return;
  t.entity_ops.push({entity_id:entityId, ops:['R']});
  markModified(); render();
}
function removeEntityOp(procId,taskId,entityId) {
  const t=S.doc.processes.find(p=>p.id===procId)?.tasks?.find(t=>t.id===taskId);
  if(!t) return; t.entity_ops=(t.entity_ops||[]).filter(eo=>eo.entity_id!==entityId);
  markModified(); render();
}
function toggleEntityOp(procId,taskId,entityId,op,checked) {
  const t=S.doc.processes.find(p=>p.id===procId)?.tasks?.find(t=>t.id===taskId);
  const eo=t?.entity_ops?.find(eo=>eo.entity_id===entityId);
  if(!eo) return;
  if(checked){if(!eo.ops.includes(op))eo.ops.push(op);}
  else{eo.ops=eo.ops.filter(o=>o!==op);}
  markModified();
}

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Entities
═══════════════════════════════════════════════════════════ */
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
function addRelation() {
  const ents=S.doc.entities||[];
  if(ents.length<2){alert('至少需要2个实体才能建立关系');return;}
  S.doc.relations=S.doc.relations||[];
  S.doc.relations.push({from:ents[0].id,to:ents[1].id,type:'1:N',label:''});
  markModified(); render();
}
function removeRelation(idx){S.doc.relations.splice(idx,1);markModified();render();}
function setRelation(idx,key,val){if(S.doc.relations[idx]){S.doc.relations[idx][key]=val;markModified();}}

/* ═══════════════════════════════════════════════════════════
   RENDER — entry
═══════════════════════════════════════════════════════════ */
function render() {
  if(!S.doc){renderNoDoc();return;}
  renderToolbar();
  renderSidebar();
  renderTabBar();
  const t=S.ui.tab;
  if     (t==='domain') renderDomainTab();
  else if(t==='process') renderProcessTab();
  else if(t==='data')   renderDataTab();
  else if(t==='preview') renderPreviewTab();
  /* 渲染完成后初始化所有 auto-resize textarea 高度 */
  setTimeout(initAutoResize, 0);
}

function renderToolbar() {
  const name = S.doc?.meta?.domain || S.currentFile || '—';
  document.getElementById('file-name').textContent = name;
  document.getElementById('modified-dot')?.classList.toggle('hidden',!S.modified);
}

function renderNoDoc() {
  document.getElementById('sidebar-content').innerHTML =
    `<div class="sb-empty" style="padding:20px 12px;line-height:1.8">新建或打开文档<br>开始建模</div>`;
  document.getElementById('tab-bar').innerHTML='';
  document.getElementById('tab-content').innerHTML=`
    <div class="empty-state">
      <h2>BML 业务建模工具</h2>
      <p>结构化记录业务理解，生成可读文档</p>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary" onclick="App.cmdNew()">新建文档</button>
        <button class="btn btn-outline" onclick="App.cmdOpen()">打开文档</button>
      </div>
    </div>`;
}

/* ─── 辅助：渲染单个流程条目及其任务 ─── */
function _renderSbProc(p) {
  const procKey=`proc-${p.id}`;
  const collapsed=S.ui.sbCollapse[procKey];
  const procActive=S.ui.tab==='process'&&S.ui.procId===p.id&&!S.ui.taskId;
  let h=`<div class="sb-proc-head ${procActive?'active':''}"
    onclick="navigate('process',{procId:'${p.id}',taskId:null})">
    <button class="sb-caret" onclick="event.stopPropagation();toggleCollapse('${procKey}')">${collapsed?'▶':'▾'}</button>
    <span class="sb-id editable-id" onclick="event.stopPropagation();startEditId(this,'proc','${p.id}')" title="点击编辑ID">${esc(p.id)}</span>
    <span class="sb-name">${esc(p.name||'未命名')}</span>
    <span class="sb-move-btns">
      <button class="sb-move-btn" onclick="moveProcInSd('${esc(p.id)}',-1,event)" title="上移">↑</button>
      <button class="sb-move-btn" onclick="moveProcInSd('${esc(p.id)}',1,event)" title="下移">↓</button>
    </span>
  </div>`;
  if(!collapsed) {
    for(const t of (p.tasks||[])) {
      const tActive=S.ui.tab==='process'&&S.ui.taskId===t.id;
      h+=`<div class="sb-task-item ${tActive?'active':''}"
        onclick="navigate('process',{procId:'${p.id}',taskId:'${t.id}'})">
        <span class="sb-id editable-id" onclick="event.stopPropagation();startEditId(this,'task','${p.id}','${t.id}')" title="点击编辑ID">${esc(t.id)}</span>
        <span class="sb-name">${esc(t.name||'未命名')}</span>
        ${t.repeatable?'<span class="sb-repeat" title="可重复">↺</span>':''}
      </div>`;
    }
  }
  return h;
}

/* ═══════════════════════════════════════════════════════════
   RENDER — Sidebar (collapsible tree)
═══════════════════════════════════════════════════════════ */
function renderSidebar() {
  const procs    = S.doc.processes||[];
  const entities = S.doc.entities||[];
  const collapsed = S.ui.sidebarCollapsed;

  /* 控制侧边栏宽度 & 外部按钮文字 */
  const sb = document.getElementById('sidebar');
  if(sb) sb.classList.toggle('sb-collapsed', collapsed);
  const toggleBtn = document.getElementById('sb-toggle-btn');
  if(toggleBtn) toggleBtn.textContent = collapsed ? '展开' : '折叠';

  if(collapsed) {
    document.getElementById('sidebar-content').innerHTML='';
    return;
  }

  let h='';

  /* ── 流程区（按业务子域分组） ── */
  h+=`<div class="sb-section">
    <div class="sb-header">
      <span>流程</span>
      <button class="sb-add-btn" onclick="addProcess()" title="新建流程">＋</button>
    </div>`;

  if(!procs.length){
    h+=`<div class="sb-empty">暂无流程</div>`;
  } else {
    /* 收集业务子域 */
    const subDomains=[...new Set(procs.map(p=>p.subDomain||''))];
    for(const sd of subDomains) {
      const sdProcs=procs.filter(p=>(p.subDomain||'')===sd);
      if(sd) {
        const sdKey=`sd-${sd}`;
        const collapsed=S.ui.sbCollapse[sdKey];
        h+=`<div class="sb-grp-head" onclick="toggleCollapse('${sdKey}')">
          <button class="sb-caret">${collapsed?'▶':'▾'}</button>
          <span class="sb-name">${esc(sd)}</span>
          <button class="sb-add-btn" onclick="event.stopPropagation();addProcess('${esc(sd)}')" title="在此子域新建流程">＋</button>
          <span class="sb-move-btns">
            <button class="sb-move-btn" onclick="moveSdGroup('${esc(sd)}',-1,event)" title="上移">↑</button>
            <button class="sb-move-btn" onclick="moveSdGroup('${esc(sd)}',1,event)" title="下移">↓</button>
          </span>
        </div>`;
        if(!collapsed) {
          for(const p of sdProcs) {
            h+=_renderSbProc(p);
          }
        }
      } else {
        /* 无业务子域的流程直接列出 */
        for(const p of sdProcs) {
          h+=_renderSbProc(p);
        }
      }
    }
  }
  h+=`</div>`;

  /* ── 实体区（按主题域分组） ── */
  h+=`<div class="sb-section">
    <div class="sb-header">
      <span>实体</span>
      <button class="sb-add-btn" onclick="addEntity()" title="新建实体">＋</button>
    </div>`;

  if(!entities.length){
    h+=`<div class="sb-empty">暂无实体</div>`;
  } else {
    /* 收集主题域 */
    const groups=[...new Set(entities.map(e=>e.group||''))];
    for(const grp of groups) {
      const grpEntities=entities.filter(e=>(e.group||'')===grp);
      if(grp) {
        const grpKey=`grp-${grp}`;
        const collapsed=S.ui.sbCollapse[grpKey];
        h+=`<div class="sb-grp-head" onclick="toggleCollapse('${grpKey}')">
          <button class="sb-caret">${collapsed?'▶':'▾'}</button>
          <span class="sb-name">${esc(grp)}</span>
          <button class="sb-add-btn" onclick="event.stopPropagation();addEntity('${esc(grp)}')" title="在此主题域新建实体">＋</button>
          <span class="sb-move-btns">
            <button class="sb-move-btn" onclick="moveGrpGroup('${esc(grp)}',-1,event)" title="上移">↑</button>
            <button class="sb-move-btn" onclick="moveGrpGroup('${esc(grp)}',1,event)" title="下移">↓</button>
          </span>
        </div>`;
        if(!collapsed) {
          for(const e of grpEntities) {
            const active=S.ui.tab==='data'&&S.ui.entityId===e.id;
            h+=`<div class="sb-entity-item ${active?'active':''}"
              onclick="navigate('data',{entityId:'${e.id}'})">
              <span class="sb-id editable-id" onclick="event.stopPropagation();startEditId(this,'entity','${e.id}')" title="点击编辑ID">${esc(e.id)}</span>
              <span class="sb-name">${esc(e.name||'未命名')}</span>
              <span class="sb-move-btns">
                <button class="sb-move-btn" onclick="moveEntityInGrp('${esc(e.id)}',-1,event)" title="上移">↑</button>
                <button class="sb-move-btn" onclick="moveEntityInGrp('${esc(e.id)}',1,event)" title="下移">↓</button>
              </span>
            </div>`;
          }
        }
      } else {
        /* 无主题域的实体直接列出 */
        for(const e of grpEntities) {
          const active=S.ui.tab==='data'&&S.ui.entityId===e.id;
          h+=`<div class="sb-item ${active?'active':''}"
            onclick="navigate('data',{entityId:'${e.id}'})">
            <span class="sb-id">${esc(e.id)}</span>
            <span class="sb-name">${esc(e.name||'未命名')}</span>
            <span class="sb-move-btns">
              <button class="sb-move-btn" onclick="moveEntityInGrp('${esc(e.id)}',-1,event)" title="上移">↑</button>
              <button class="sb-move-btn" onclick="moveEntityInGrp('${esc(e.id)}',1,event)" title="下移">↓</button>
            </span>
          </div>`;
        }
      }
    }
  }
  h+=`</div>`;

  document.getElementById('sidebar-content').innerHTML=h;
}

/* ═══════════════════════════════════════════════════════════
   RENDER — Tab Bar
═══════════════════════════════════════════════════════════ */
function renderTabBar() {
  const tabs=[
    {id:'domain', label:'业务域'},
    {id:'process',label:'流程'},
    {id:'data',   label:'数据'},
    {id:'preview',label:'预览'},
  ];
  document.getElementById('tab-bar').innerHTML=tabs.map(t=>
    `<button class="tab-btn ${S.ui.tab===t.id?'active':''}"
      onclick="navigate('${t.id}',{})">${t.label}</button>`
  ).join('');
}

/* ═══════════════════════════════════════════════════════════
   CARD MAP — 流程地图拖拽
═══════════════════════════════════════════════════════════ */
/* 找第一个空位（不与任何现有流程重叠） */
function _nextFreePos(procs, excludeId) {
  const occ = new Set(procs.filter(p=>p.id!==excludeId && p.pos)
                           .map(p=>`${p.pos.r},${p.pos.c}`));
  for(let r=1;r<=20;r++)
    for(let c=1;c<=8;c++)
      if(!occ.has(`${r},${c}`)) return {r, c};
  return {r:1, c:procs.length+1};
}

function ensureProcPos(doc) {
  (doc.processes||[]).forEach(p => {
    if(!p.pos) p.pos = _nextFreePos(doc.processes, p.id);
  });
}

/* 就地更新卡片坐标（不重绘整个 Tab，保留滚动位置） */
function _applyCardPositions() {
  const map = document.getElementById('card-map');
  if(!map) return;
  const allProcs = S.doc.processes||[];
  const gW = _cardGridW(), gH = _cardGridH();
  const maxRow = Math.max(...allProcs.map(p=>p.pos?.r||1));
  const maxCol = Math.max(...allProcs.map(p=>p.pos?.c||1));
  map.style.height    = `${maxRow*gH+8}px`;
  map.style.minWidth  = `${Math.max(maxCol*gW+8,600)}px`;
  for(const proc of allProcs) {
    const card = map.querySelector(`.proc-card[data-id="${proc.id}"]`);
    if(!card) continue;
    const r=proc.pos?.r||1, c=proc.pos?.c||1;
    card.style.left      = `${(c-1)*gW+8}px`;
    card.style.top       = `${(r-1)*gH+8}px`;
    card.style.transform = '';
    card.style.zIndex    = '';
  }
}

function startCardDrag(procId, e) {
  e.preventDefault();
  const proc = S.doc.processes.find(p=>p.id===procId);
  if(!proc) return;
  dragState = { procId, startPos:{...proc.pos},
    startX:e.clientX, startY:e.clientY };
  document.addEventListener('mousemove', onCardDrag);
  document.addEventListener('mouseup',   endCardDrag);
}

function onCardDrag(e) {
  if(!dragState) return;
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  const card = document.querySelector(`.proc-card[data-id="${dragState.procId}"]`);
  if(card) { card.style.transform=`translate(${dx}px,${dy}px)`; card.style.zIndex='100'; }
}

function endCardDrag(e) {
  if(!dragState) return;
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  const proc = S.doc.processes.find(p=>p.id===dragState.procId);
  if(proc) {
    /* tiny movement = click → navigate */
    if(Math.abs(dx) < 5 && Math.abs(dy) < 5) {
      document.removeEventListener('mousemove', onCardDrag);
      document.removeEventListener('mouseup',   endCardDrag);
      dragState = null;
      navigate('process', {procId: proc.id, taskId: null});
      return;
    }
    const gW = _cardGridW(), gH = _cardGridH();
    const newC = Math.max(1, dragState.startPos.c + Math.round(dx/gW));
    const newR = Math.max(1, dragState.startPos.r + Math.round(dy/gH));
    const newPos = {r:newR, c:newC};
    /* 目标格已有其他流程 → 互换位置 */
    const occupant = S.doc.processes.find(
      p => p.id!==proc.id && p.pos?.r===newR && p.pos?.c===newC);
    if(occupant) occupant.pos = {...dragState.startPos};
    proc.pos = newPos;
    markModified();
    _applyCardPositions(); /* 就地更新，不滚回顶部 */
  }
  document.removeEventListener('mousemove', onCardDrag);
  document.removeEventListener('mouseup',   endCardDrag);
  dragState = null;
}

/* ═══════════════════════════════════════════════════════════
   RENDER — Domain Tab (原概览)
═══════════════════════════════════════════════════════════ */
function renderDomainTab() {
  ensureProcPos(S.doc);
  const m=S.doc.meta||{};
  const roles=S.doc.roles||[];
  const lang=S.doc.language||[];
  let h='<div class="domain-scroll">';

  /* ── 紧凑信息栏：业务域 / 角色 / 统一语言 三行合一卡片 ── */
  const langCollapsed = S.ui.sbCollapse['lang'] !== false; /* 默认折叠 */
  h+=`<div class="ctx-card domain-info-bar">
    <div class="info-bar-row">
      <span class="info-bar-label">业务域名称</span>
      <input type="text" style="flex:1" value="${esc(m.domain||m.title||'')}"
        oninput="setDomain(this.value)" placeholder="如：仓储管理 v2、采购">
      <span class="info-bar-label" style="margin-left:12px">日期</span>
      <input type="text" style="width:100px" value="${esc(m.date||'')}"
        oninput="setMeta('date',this.value)" placeholder="2025-01">
    </div>
    <div class="info-bar-row">
      <span class="info-bar-label">参与角色</span>
      <div class="role-tag-list" style="flex:1;flex-wrap:wrap;margin:0">`;
  roles.forEach((r,i)=>{
    h+=`<span class="role-tag">${esc(r)}<button class="role-del" onclick="removeRole(${i})">×</button></span>`;
  });
  h+=`</div>
      <input type="text" id="role-input" style="width:110px" placeholder="输入角色名"
        onkeydown="if(event.key==='Enter')addRole()">
      <button class="btn btn-outline btn-sm" onclick="addRole()">添加</button>
    </div>
    <div class="info-bar-row info-bar-lang" onclick="toggleDomainSection('lang')" style="cursor:pointer">
      <span class="info-bar-label">统一语言</span>
      <span class="lang-collapse-btn">${langCollapsed?'▶':'▾'}</span>
      ${langCollapsed&&lang.length?`<span class="lang-summary">共 ${lang.length} 条术语，点击展开</span>`:''}
      ${langCollapsed&&!lang.length?`<span class="lang-summary">暂无术语，点击展开添加</span>`:''}
      <span style="flex:1"></span>
      ${!langCollapsed?`<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();addTerm()">＋ 添加术语</button>`:''}
    </div>
  </div>`;

  if(!langCollapsed) {
    h+=`<div class="ctx-card" style="margin-top:-12px;border-top-left-radius:0;border-top-right-radius:0">`;
    if(lang.length){
      h+=`<table class="term-table">
        <thead><tr><th>术语</th><th>定义</th><th></th></tr></thead><tbody>`;
      lang.forEach((t,i)=>{
        h+=`<tr>
          <td><input type="text" value="${esc(t.term||'')}"
            oninput="setTerm(${i},'term',this.value)" placeholder="术语"></td>
          <td><input type="text" value="${esc(t.definition||'')}"
            oninput="setTerm(${i},'definition',this.value)" placeholder="定义"></td>
          <td><button class="field-del" onclick="removeTerm(${i})">✕</button></td>
        </tr>`;
      });
      h+=`</tbody></table>`;
    } else {
      h+=`<p class="no-refs">暂无术语定义</p>`;
    }
    h+=`</div>`;
  }

  h+=`</div>`; /* end domain-scroll */

  document.getElementById('tab-content').innerHTML=h;
}

/* ═══════════════════════════════════════════════════════════
   RENDER — Process Tab  (上：实时图 | 下：编辑)
═══════════════════════════════════════════════════════════ */
function renderProcessTab() {
  ensureProcPos(S.doc);
  const procs=S.doc.processes||[];
  const proc=currentProc();
  const task=currentTask();
  const view=S.ui.procView||'list';

  /* ── 视图切换工具栏 ── */
  let h=`<div class="proc-view-toolbar">
    <div class="view-toggle-group">
      <button class="vtb ${view==='list'?'active':''}" onclick="setProcView('list')">概要视图</button>
      <button class="vtb ${view==='card'?'active':''}" onclick="setProcView('card')">卡片视图</button>
    </div>
    ${proc&&view==='list'?`<button class="btn btn-ghost-sm" onclick="removeProcess('${proc.id}')">删除流程</button>`:''}
    <button class="btn btn-outline btn-sm" onclick="addProcess()">＋ 新流程</button>
  </div>`;

  if(!procs.length) {
    h+=`<div style="padding:24px;color:var(--text-m)">暂无流程，点击右上角新建</div>`;
    document.getElementById('tab-content').innerHTML=h;
    return;
  }

  /* ══ 卡片视图 ══ */
  if(view==='card') {
    const maxRow=Math.max(...procs.map(p=>p.pos?.r||1));
    const maxCol=Math.max(...procs.map(p=>p.pos?.c||1));
    h+=`<div class="card-view-area">
      <div id="card-map" class="card-map"
        style="height:${maxRow*CARD_H+8}px;min-width:${Math.max(maxCol*CARD_W+8,600)}px">`;
    for(const p of procs) {
      const r=p.pos?.r||1, c=p.pos?.c||1;
      h+=`<div class="proc-card" data-id="${esc(p.id)}"
        style="left:${(c-1)*CARD_W+8}px;top:${(r-1)*CARD_H+8}px;width:${CARD_W-16}px;height:${CARD_H-16}px">
        <div class="pc-header" onmousedown="startCardDrag('${esc(p.id)}',event)" onclick="event.stopPropagation()">
          <span class="pc-id">${esc(p.id)}</span>
          <span class="pc-name">${esc(p.name||'未命名')}</span>
          <button class="pc-goto btn-icon"
            onclick="setProcView('list');navigate('process',{procId:'${esc(p.id)}',taskId:null})"
            title="进入编辑">→</button>
        </div>
        <div id="pc-diag-${esc(p.id)}" class="pc-diag pf-clickable"
          onclick="setProcView('list');navigate('process',{procId:'${esc(p.id)}',taskId:null})"
          title="点击进入编辑"></div>
      </div>`;
    }
    h+=`</div></div>`;
    document.getElementById('tab-content').innerHTML=h;
    for(const p of procs) {
      if((p.tasks||[]).length) renderProcFlow(`pc-diag-${p.id}`, p, null);
    }
    return;
  }

  /* ══ 概要视图：映射网格（全高）+ 右侧抽屉编辑 ══ */
  const ovMaxRow=Math.max(...procs.map(p=>p.pos?.r||1));
  const ovMaxCol=Math.max(...procs.map(p=>p.pos?.c||1));
  h+=`<div class="ov-map-wrap ov-full">
    <div id="card-map" class="ov-map"
      style="height:${ovMaxRow*OV_CARD_H+8}px;min-width:${Math.max(ovMaxCol*OV_CARD_W+8,400)}px">`;
  for(const p of procs) {
    const r=p.pos?.r||1, c=p.pos?.c||1;
    const taskCnt=(p.tasks||[]).length;
    const stepCnt=(p.tasks||[]).reduce((n,t)=>n+(t.steps?.length||0),0);
    const isActive=S.ui.procId===p.id;
    h+=`<div class="proc-card ov-card${isActive?' ov-active':''}" data-id="${esc(p.id)}"
      style="left:${(c-1)*OV_CARD_W+8}px;top:${(r-1)*OV_CARD_H+8}px;width:${OV_CARD_W-12}px;height:${OV_CARD_H-10}px">
      <div class="ovc-header" onmousedown="startCardDrag('${esc(p.id)}',event)" onclick="event.stopPropagation()">
        <span class="ovc-id">${esc(p.id)}</span>
        <span class="ovc-name">${esc(p.name||'未命名')}</span>
      </div>
      <div class="ovc-body" onclick="navigate('process',{procId:'${esc(p.id)}',taskId:null})">
        ${p.subDomain?`<span class="ovc-sd">${esc(p.subDomain)}</span>`:''}
        <span class="ovc-cnt">${taskCnt}T · ${stepCnt}S</span>
      </div>
    </div>`;
  }
  h+=`</div></div>`;

  /* ── 右侧抽屉（点击流程卡片后滑入） ── */
  const drawerW = S.ui.drawerW || 480;
  h+=`<div class="proc-drawer${proc?' open':''}" style="width:${drawerW}px">
    <div class="drawer-resize-handle" onmousedown="startDrawerResize(event)"></div>`;

  if(proc) {
    /* 抽屉头部 */
    h+=`<div class="drawer-head">
      <div class="drawer-crumb">
        <span class="drawer-crumb-proc" onclick="navigate('process',{procId:'${esc(proc.id)}',taskId:null})"
          title="回到流程">${esc(proc.id)} ${esc(proc.name||'')}</span>
        ${task?`<span class="dc-sep">›</span>
          <span>${esc(task.id)} ${esc(task.name||'')}</span>`:''}
      </div>
      <div class="drawer-actions">
        ${!task?`<button class="btn btn-outline btn-sm" onclick="addTask('${esc(proc.id)}')">＋ 任务</button>`:''}
        ${!task?`<button class="btn btn-ghost-sm" onclick="removeProcess('${esc(proc.id)}')">删除流程</button>`:''}
        ${task?`<button class="btn btn-danger btn-sm" onclick="removeTask('${esc(proc.id)}','${esc(task.id)}')">删除任务</button>`:''}
        <button class="drawer-close" onclick="navigate('process',{procId:null,taskId:null})" title="关闭抽屉">✕</button>
      </div>
    </div>`;

    /* 流程图（小图） */
    h+=`<div class="drawer-diag">
      <div class="drawer-diag-bar">
        <span class="live-diagram-hint">点击任务节点进入编辑</span>
        <div class="zoom-controls">
          <button class="zoom-btn" onclick="zoomBy('proc-diagram',0.2)">＋</button>
          <button class="zoom-btn" onclick="resetZoom('proc-diagram')">⊙</button>
          <button class="zoom-btn" onclick="zoomBy('proc-diagram',-0.2)">－</button>
        </div>
      </div>
      <div id="proc-diagram" class="live-diagram" style="padding:6px 12px"></div>
    </div>`;

    /* 编辑表单 */
    h+=`<div class="drawer-body">`;

    if(task) {
      /* ── 任务编辑 ── */
      h+=`<div class="form-grid" style="margin-bottom:16px">
        <div class="field-group">
          <label>任务名称</label>
          <input type="text" value="${esc(task.name||'')}" placeholder="如：录入采购单"
            oninput="setTask('${esc(proc.id)}','${esc(task.id)}','name',this.value);renderSidebar();renderProcDiagramNow()">
        </div>
        <div class="field-group">
          <label>执行角色</label>`;

      const roles=getRoles();
      const isCustomRole = roles.length && task.role && !roles.includes(task.role);
      if(roles.length) {
        h+=`<div style="display:flex;gap:6px;align-items:center">
          <select style="flex-shrink:0;width:auto" onchange="onRoleChange(this,'${esc(proc.id)}','${esc(task.id)}')">
            <option value="">请选择...</option>
            ${roles.map(r=>`<option value="${esc(r)}" ${task.role===r?'selected':''}>${esc(r)}</option>`).join('')}
            <option value="__custom__" ${isCustomRole?'selected':''}>自定义...</option>
          </select>
          ${isCustomRole?`<input type="text" value="${esc(task.role)}" placeholder="自定义角色名"
            style="flex:1"
            oninput="setTask('${esc(proc.id)}','${esc(task.id)}','role',this.value);renderProcDiagramNow()">`:''}</div>`;
      } else {
        h+=`<input type="text" value="${esc(task.role||'')}" placeholder="如：采购员"
          oninput="setTask('${esc(proc.id)}','${esc(task.id)}','role',this.value);renderProcDiagramNow()">`;
      }
      h+=`</div>
        <div class="field-group" style="grid-column:1/-1">
          <label style="display:flex;align-items:center;gap:8px">
            可重复
            <input type="checkbox" ${task.repeatable?'checked':''}
              onchange="setTask('${esc(proc.id)}','${esc(task.id)}','repeatable',this.checked);render()">
            <span style="font-size:11px;color:var(--text-m);font-weight:400">同一流程中可被执行多次 ↺</span>
          </label>
        </div>
      </div>`;

      /* 步骤 */
      h+=`<div class="form-section">
        <h4>操作步骤 <button class="btn btn-outline btn-sm" onclick="addStep('${esc(proc.id)}','${esc(task.id)}')">＋</button></h4>`;
      if(task.steps?.length){
        h+=`<div class="step-list">`;
        task.steps.forEach((s,i)=>{
          h+=`<div class="step-row">
            <div class="step-row-top">
              <span class="step-num">${i+1}</span>
              <input class="step-name" type="text" value="${esc(s.name||'')}" placeholder="步骤描述"
                oninput="setStep('${esc(proc.id)}','${esc(task.id)}',${i},'name',this.value)">
              <select class="step-type" onchange="onStepTypeChange(this,'${esc(proc.id)}','${esc(task.id)}',${i})">
                ${STEP_TYPES.map(t=>`<option value="${t.value}" ${(t.value==='__other__'?isCustomStepType(s.type):s.type===t.value)?'selected':''}>${t.label}</option>`).join('')}
              </select>${isCustomStepType(s.type)?`<input class="step-type-custom" type="text" value="${esc(s.type)}" placeholder="自定义类型"
                oninput="setStep('${esc(proc.id)}','${esc(task.id)}',${i},'type',this.value)">`:''}
              <button class="step-del" onclick="removeStep('${esc(proc.id)}','${esc(task.id)}',${i})">✕</button>
            </div>
            <textarea class="step-note auto-resize" rows="1" placeholder="条件 / 备注 / 规则"
              oninput="setStep('${esc(proc.id)}','${esc(task.id)}',${i},'note',this.value);autoResize(this)"
              >${esc(s.note||'')}</textarea>
          </div>`;
        });
        h+=`</div>`;
      } else { h+=`<p class="no-refs">暂无步骤</p>`; }
      h+=`</div>`;

      /* 涉及实体 */
      const eops=task.entity_ops||[];
      h+=`<div class="form-section"><h4>涉及实体</h4>`;
      if(eops.length){
        h+=`<div class="eop-list">`;
        for(const eo of eops){
          const en=getEntityName(eo.entity_id);
          h+=`<div class="eop-tag">
            <span class="eop-name" onclick="navigate('data',{entityId:'${eo.entity_id}'})" title="→ 实体详情">${esc(en)}</span>
            <div class="eop-ops">`;
          for(const op of ['C','R','U','D']){
            const chk=eo.ops?.includes(op)?'checked':'';
            const cls=op==='C'?'op-c':op==='U'?'op-u':op==='D'?'op-d':'';
            h+=`<label class="op-cb">
              <input type="checkbox" ${chk}
                onchange="toggleEntityOp('${esc(proc.id)}','${esc(task.id)}','${eo.entity_id}','${op}',this.checked)">
              <span class="${cls}">${op}</span></label>`;
          }
          h+=`</div><button class="eop-del" onclick="removeEntityOp('${esc(proc.id)}','${esc(task.id)}','${eo.entity_id}')">✕</button></div>`;
        }
        h+=`</div>`;
      } else { h+=`<p class="no-refs" style="margin-bottom:8px">尚未关联实体</p>`; }
      const avail=(S.doc.entities||[]).filter(e=>!eops.some(eo=>eo.entity_id===e.id));
      if(avail.length){
        h+=`<div class="add-eop-row">
          <select id="eop-sel-${task.id}">
            <option value="">选择实体...</option>
            ${avail.map(e=>`<option value="${e.id}">${e.id} ${esc(e.name)}</option>`).join('')}
          </select>
          <button class="btn btn-outline btn-sm"
            onclick="addEntityOp('${esc(proc.id)}','${esc(task.id)}',document.getElementById('eop-sel-${task.id}').value)">关联</button>
        </div>`;
      }
      h+=`</div>`;

      /* 业务规则 */
      h+=`<div class="form-section">
        <h4>业务规则 <span class="section-hint">约束、前置条件、决策逻辑</span></h4>
        <textarea rows="3" placeholder="如：金额>10000需主管审批"
          oninput="setTask('${esc(proc.id)}','${esc(task.id)}','rules_note',this.value)"
          >${esc(task.rules_note||'')}</textarea>
      </div>`;

    } else {
      /* ── 流程信息 ── */
      h+=`<div class="form-grid">
        <div class="field-group">
          <label>流程名称</label>
          <input type="text" id="proc-name-input" value="${esc(proc.name||'')}"
            placeholder="如：采购入库流程"
            oninput="setProc('${esc(proc.id)}','name',this.value);renderSidebar();renderProcDiagramNow()">
        </div>
        <div class="field-group">
          <label>业务子域</label>
          <input type="text" value="${esc(proc.subDomain||'')}" placeholder="如：订单子域"
            oninput="setProc('${esc(proc.id)}','subDomain',this.value);renderSidebar()">
        </div>
        <div class="field-group">
          <label>触发条件</label>
          <input type="text" value="${esc(proc.trigger||'')}" placeholder="什么事件触发此流程"
            oninput="setProc('${esc(proc.id)}','trigger',this.value)">
        </div>
        <div class="field-group">
          <label>预期结果</label>
          <input type="text" value="${esc(proc.outcome||'')}" placeholder="流程完成后达成的状态"
            oninput="setProc('${esc(proc.id)}','outcome',this.value)">
        </div>
      </div>
      <p style="margin-top:14px;font-size:12px;color:var(--text-m)">
        点击上方流程图中的任务节点可直接进入任务编辑
      </p>`;
      setTimeout(()=>document.getElementById('proc-name-input')?.focus(),40);
    }

    h+=`</div>`; /* end drawer-body */
  } else {
    /* 无选中：提示语 */
    h+=`<div class="drawer-empty"><p>点击流程卡片打开编辑</p></div>`;
  }

  h+=`</div>`; /* end proc-drawer */

  document.getElementById('tab-content').innerHTML=h;

  /* 渲染流程图 */
  if(proc) {
    const clickMap={};
    for(const t of (proc.tasks||[]))
      clickMap[t.id]=()=>navigate('process',{procId:proc.id,taskId:t.id});
    renderProcFlow('proc-diagram', proc, clickMap);
  }
}

/* 仅刷新流程图，不重建整个 DOM（输入框连续输入时用） */
function renderProcDiagramNow() {
  const proc=currentProc(); if(!proc) return;
  const clickMap={};
  for(const t of (proc.tasks||[]))
    clickMap[t.id]=()=>navigate('process',{procId:proc.id,taskId:t.id});
  renderProcFlow('proc-diagram', proc, clickMap);
}

/* ═══════════════════════════════════════════════════════════
   RENDER — Data Tab  (实体图全高 + 右侧抽屉编辑)
═══════════════════════════════════════════════════════════ */
function renderDataTab() {
  const entities=S.doc.entities||[];
  const entity=entities.find(e=>e.id===S.ui.entityId)||null;
  const drawerW = S.ui.drawerW || 480;

  let h='';

  /* 实体关系图（全高） */
  h+=`<div class="live-diagram-wrap entity-diag-full" id="diagram-wrap">
    <div class="live-diagram-toolbar">
      <span class="live-diagram-hint">拖拽节点 · Ctrl+滚轮缩放 · 点击节点进入编辑</span>
      <button class="btn btn-outline btn-sm" onclick="addEntity()">＋ 新建实体</button>
      <button class="btn btn-ghost-sm" onclick="resetEfLayout()" title="清除手动布局，恢复辐射排列">重置布局</button>
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
  h+=`<div class="entity-drawer${entity?' open':''}" style="width:${drawerW}px">
    <div class="drawer-resize-handle" onmousedown="startDrawerResize(event)"></div>`;

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
      <h4>实体关系 <button class="btn btn-outline btn-sm" onclick="addRelation()">＋</button></h4>`;
    if(relations.length){
      h+=`<div class="rel-list">`;
      relations.forEach((r,i)=>{
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
    } else { h+=`<p class="no-refs">暂无关系</p>`; }
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
function onRoleChange(sel, procId, taskId) {
  if (sel.value === '__custom__') {
    /* 不 re-render，直接 DOM 插入输入框 */
    const wrap = sel.parentElement;
    let inp = wrap.querySelector('input[placeholder="自定义角色名"]');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'text'; inp.placeholder = '自定义角色名'; inp.style.flex = '1';
      inp.oninput = () => { setTask(procId, taskId, 'role', inp.value); renderProcDiagramNow(); };
      wrap.appendChild(inp);
    }
    inp.focus();
  } else {
    setTask(procId, taskId, 'role', sel.value);
    renderProcDiagramNow();
  }
}

function isCustomStepType(type) {
  if (type === null || type === undefined) return false;
  return !STEP_TYPES.some(t => t.value !== '__other__' && t.value === type);
}
function onStepTypeChange(sel, procId, taskId, idx) {
  const val = sel.value;
  if (val === '__other__') {
    setStep(procId, taskId, idx, 'type', '');
    render();
    const rows = document.querySelectorAll('.step-row');
    const input = rows[idx]?.querySelector('.step-type-custom');
    if (input) { input.focus(); }
  } else {
    setStep(procId, taskId, idx, 'type', val);
    render();
  }
}

/* ── 抽屉宽度拖拽 ── */
function startDrawerResize(e) {
  e.preventDefault(); e.stopPropagation();
  const drawer = e.currentTarget.closest('.proc-drawer, .entity-drawer');
  if(!drawer) return;
  const startX = e.clientX;
  const startW = drawer.offsetWidth;
  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';
  function onMove(ev) {
    const newW = Math.max(300, Math.min(window.innerWidth * 0.75, startW + startX - ev.clientX));
    drawer.style.width = newW + 'px';
    S.ui.drawerW = newW;
  }
  function onUp() {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/* ── 实体关系图区域高度控制 ── */
function startDiagramResize(e) {
  e.preventDefault();
  const wrap   = document.getElementById('diagram-wrap');
  const handle = document.getElementById('diagram-resize-handle');
  if (!wrap) return;
  const startY = e.clientY;
  const startH = wrap.offsetHeight;
  handle.classList.add('dragging');
  document.body.style.cursor = 'ns-resize';
  document.body.style.userSelect = 'none';

  function onMove(ev) {
    const newH = Math.max(80, Math.min(window.innerHeight * 0.85, startH + ev.clientY - startY));
    wrap.style.height = newH + 'px';
    S.ui.diagramH = newH;
    S.ui.diagramExpanded = false;
    const btn = document.getElementById('expand-diagram-btn');
    if (btn) btn.textContent = '展开 ↓';
  }
  function onUp() {
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function toggleDiagramExpand() {
  const wrap = document.getElementById('diagram-wrap');
  const btn  = document.getElementById('expand-diagram-btn');
  if (!wrap) return;
  if (!S.ui.diagramExpanded) {
    S.ui._prevDiagramH = S.ui.diagramH || 260;
    const expandH = Math.floor(window.innerHeight * 0.72);
    wrap.style.height = expandH + 'px';
    S.ui.diagramH = expandH;
    S.ui.diagramExpanded = true;
    if (btn) btn.textContent = '收起 ↑';
  } else {
    const h = S.ui._prevDiagramH || 260;
    wrap.style.height = h + 'px';
    S.ui.diagramH = h;
    S.ui.diagramExpanded = false;
    if (btn) btn.textContent = '展开 ↓';
  }
}

/* ═══════════════════════════════════════════════════════════
   OFFLINE MD RENDERER
   针对 BML 固定结构，无需任何 CDN 依赖
   支持：h1-h4 / hr / 表格 / **粗体** / mermaid块 / 段落
═══════════════════════════════════════════════════════════ */
function renderBmlMd(md) {
  /* 先把 mermaid 块抽出来 */
  const diagrams = [];
  const src = md.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
    diagrams.push(code.trim());
    return `\x00MERMAID:${diagrams.length - 1}\x00`;
  });

  const lines = src.split('\n');
  let html = '';
  let i = 0;

  function inlineEsc(s) {
    return s
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/`([^`]+)`/g,'<code>$1</code>');
  }

  while(i < lines.length) {
    const line = lines[i];

    /* mermaid 占位 */
    if(line.startsWith('\x00MERMAID:')) {
      const idx = parseInt(line.slice(9));
      html += `<div class="md-mermaid" data-idx="${idx}"></div>`;
      i++; continue;
    }

    /* 标题 */
    if(line.startsWith('#### ')) { html += `<h4>${inlineEsc(line.slice(5))}</h4>`; i++; continue; }
    if(line.startsWith('### '))  { html += `<h3>${inlineEsc(line.slice(4))}</h3>`; i++; continue; }
    if(line.startsWith('## '))   { html += `<h2>${inlineEsc(line.slice(3))}</h2>`; i++; continue; }
    if(line.startsWith('# '))    { html += `<h1>${inlineEsc(line.slice(2))}</h1>`; i++; continue; }

    /* 分隔线 */
    if(line.trim() === '---') { html += '<hr>'; i++; continue; }

    /* 表格：连续的 | 行 */
    if(line.trim().startsWith('|')) {
      const rows = [];
      while(i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i]); i++;
      }
      /* 过滤掉分隔行（|---|---| 类型） */
      const dataRows = rows.filter(r => !/^\s*\|[\s\-|:]+\|\s*$/.test(r));
      if(dataRows.length) {
        html += '<table>';
        dataRows.forEach((row, ri) => {
          const cells = row.trim().replace(/^\||\|$/g,'').split('|');
          const tag   = ri === 0 ? 'th' : 'td';
          html += '<tr>' + cells.map(c=>`<${tag}>${inlineEsc(c.trim())}</${tag}>`).join('') + '</tr>';
        });
        html += '</table>';
      }
      continue;
    }

    /* 空行 */
    if(line.trim() === '') { i++; continue; }

    /* 普通段落（含 **bold** 内联） */
    let para = '';
    while(i < lines.length && lines[i].trim() !== '' &&
          !lines[i].startsWith('#') && !lines[i].startsWith('|') &&
          lines[i].trim() !== '---' && !lines[i].startsWith('\x00MERMAID:')) {
      if(para) para += ' ';
      para += lines[i]; i++;
    }
    if(para) html += `<p>${inlineEsc(para)}</p>`;
  }

  return { html, diagrams };
}

/* ═══════════════════════════════════════════════════════════
   RENDER — Preview Tab
═══════════════════════════════════════════════════════════ */
function renderPreviewTab() {
  document.getElementById('tab-content').innerHTML = `
    <div class="preview-wrap">
      <div class="preview-topbar">
        <button class="btn btn-outline btn-sm" onclick="App.cmdExport()">↓ 下载 .md</button>
        <button class="btn btn-ghost-sm" style="margin-left:auto" onclick="togglePreviewRaw()">显示原文 MD</button>
      </div>
      <div id="preview-rendered" class="preview-rendered pv-content"></div>
      <pre id="preview-raw" class="preview-md hidden"></pre>
    </div>`;

  if(!S.doc) return;
  document.getElementById('preview-raw').textContent = buildMdFromDoc(S.doc);
  buildHtmlPreview();
}

function buildHtmlPreview() {
  const container = document.getElementById('preview-rendered');
  if(!container || !S.doc) return;
  const doc = S.doc;
  const m   = doc.meta||{};
  const STEP_LBL  = {Query:'查询',Check:'校验',Fill:'填写',Select:'选择',Compute:'计算',Mutate:'变更'};
  const FIELD_LBL = {string:'字符',number:'数值',decimal:'金额',date:'日期',datetime:'日期时间',boolean:'布尔',enum:'枚举',text:'长文本',id:'标识ID'};

  let h = '';

  /* Title */
  h += `<h1>${esc(m.title||m.domain||'未命名')}</h1>`;

  /* Meta line */
  const metaParts = [];
  if(m.domain)  metaParts.push(`<strong>业务域</strong>: ${esc(m.domain)}`);
  if(m.author)  metaParts.push(`<strong>作者</strong>: ${esc(m.author)}`);
  if(m.date)    metaParts.push(`<strong>日期</strong>: ${esc(m.date)}`);
  if(metaParts.length) h += `<p class="pv-meta">${metaParts.join(' | ')}</p>`;

  h += '<hr>';

  /* Roles */
  const roles = doc.roles||[];
  if(roles.length) {
    h += `<h2>角色</h2>`;
    h += roles.map(r=>`<span class="role-tag">${esc(r)}</span>`).join('');
  }

  /* Language */
  const lang = doc.language||[];
  if(lang.length) {
    h += `<h2>统一语言</h2>`;
    h += `<table><thead><tr><th>术语</th><th>定义</th></tr></thead><tbody>`;
    lang.forEach(t=>{
      h += `<tr><td>${esc(t.term||'')}</td><td>${esc(t.definition||'')}</td></tr>`;
    });
    h += `</tbody></table>`;
  }

  /* Processes */
  const procs = doc.processes||[];
  const emap  = Object.fromEntries((doc.entities||[]).map(e=>[e.id,e]));
  if(procs.length) {
    h += `<h2>流程建模</h2>`;
    for(const proc of procs) {
      h += `<h3>${esc(proc.id)}: ${esc(proc.name||'')}</h3>`;
      if(proc.trigger||proc.outcome) {
        h += `<p class="pv-note"><strong>触发</strong>: ${esc(proc.trigger||'—')} → <strong>预期结果</strong>: ${esc(proc.outcome||'—')}</p>`;
      }
      /* Proc flow diagram placeholder */
      h += `<div id="pv-proc-${proc.id}" class="pv-diag"></div>`;
      /* Tasks */
      const tasks = proc.tasks||[];
      if(tasks.length) {
        h += `<div class="pv-tasks">`;
        for(const t of tasks) {
          h += `<div class="pv-task-detail">`;
          h += `<h4>${esc(t.id)}: ${esc(t.name||'')} <span class="pv-role">(${esc(t.role||'')})</span></h4>`;
          if(t.repeatable) h += `<p class="pv-note">↺ 可重复任务</p>`;
          if(t.steps?.length) {
            h += `<table><thead><tr><th>#</th><th>步骤</th><th>类型</th><th>条件/备注</th></tr></thead><tbody>`;
            t.steps.forEach((s,i)=>{
              h += `<tr><td>${i+1}</td><td>${esc(s.name||'')}</td><td>${esc(STEP_LBL[s.type]||s.type||'')}</td><td>${esc(s.note||'')}</td></tr>`;
            });
            h += `</tbody></table>`;
          }
          const eops = t.entity_ops||[];
          if(eops.length) {
            const ep = eops.map(eo=>{
              const en=(emap[eo.entity_id]?.name)||eo.entity_id;
              return `${esc(en)}（${esc((eo.ops||[]).join(','))}）`;
            });
            h += `<p class="pv-note"><strong>涉及实体</strong>: ${ep.join(', ')}</p>`;
          }
          if(t.rules_note?.trim()) h += `<p class="pv-note"><strong>业务规则</strong>: ${esc(t.rules_note)}</p>`;
          h += `</div>`;
        }
        h += `</div>`; /* pv-tasks */
      }
    }
  }

  /* Entities */
  const entities  = doc.entities||[];
  if(entities.length) {
    h += `<h2>数据建模</h2>`;
    h += `<div id="pv-entity-diag" class="pv-diag pv-entity-diag"></div>`;
    for(const e of entities) {
      h += `<h3>实体: ${esc(e.name||e.id)}</h3>`;
      if(e.note) h += `<p class="pv-note">${esc(e.note)}</p>`;
      if(e.fields?.length) {
        h += `<table><thead><tr><th>字段</th><th>类型</th><th>主键</th><th>状态字段</th><th>公式/约束</th></tr></thead><tbody>`;
        const FIELD_LBL2 = FIELD_LBL;
        e.fields.forEach(f=>{
          h += `<tr><td>${esc(f.name||'')}</td><td>${esc(FIELD_LBL2[f.type]||f.type||'')}</td>`;
          h += `<td style="text-align:center">${f.is_key?'✓':''}</td>`;
          h += `<td style="text-align:center">${f.is_status?'✓':''}</td>`;
          h += `<td>${esc(f.note||'')}</td></tr>`;
        });
        h += `</tbody></table>`;
      }
    }
  }

  container.innerHTML = h;

  /* Render proc flow diagrams */
  for(const proc of procs) {
    if((proc.tasks||[]).length) {
      renderProcFlow(`pv-proc-${proc.id}`, proc, null);
    }
  }

  /* Render entity flow diagram */
  if(entities.length) {
    renderEntityFlow('pv-entity-diag', doc, null);
  }
}

/* 从当前 doc 对象直接生成 MD（等价于服务端 build_md，离线可用） */
function buildMdFromDoc(doc) {
  if(!doc) return '';
  const STEP_LBL  = {Query:'查询',Check:'校验',Fill:'填写',Select:'选择',Compute:'计算',Mutate:'变更'};
  const FIELD_LBL = {string:'字符',number:'数值',decimal:'金额',date:'日期',datetime:'日期时间',boolean:'布尔',enum:'枚举',text:'长文本',id:'标识ID'};
  const L = [];
  const m = doc.meta||{};
  const add  = s => L.push(s??'');
  const sep  = () => { add('---'); add(''); };
  const nums = ['一','二','三','四','五','六','七','八'];
  let sn = 0;

  add(`# ${m.title||m.domain||'未命名'}`); add('');
  const parts = [['业务域',m.domain],['作者',m.author],['日期',m.date]].filter(([,v])=>v);
  if(parts.length){ add(parts.map(([k,v])=>`**${k}**: ${v}`).join(' | ')); add(''); }
  sep();

  const roles = doc.roles||[];
  if(roles.length){
    add(`## ${nums[sn++]}、角色`); add('');
    add('| 角色 |'); add('|------|');
    roles.forEach(r=>add(`| ${r} |`));
    add(''); sep();
  }

  const lang = doc.language||[];
  if(lang.length){
    add(`## ${nums[sn++]}、统一语言`); add('');
    add('| 术语 | 定义 |'); add('|------|------|');
    lang.forEach(t=>add(`| ${t.term||''} | ${t.definition||''} |`));
    add(''); sep();
  }

  const procs = doc.processes||[];
  const emap  = Object.fromEntries((doc.entities||[]).map(e=>[e.id,e]));
  add(`## ${nums[sn++]}、流程建模`); add('');

  for(const proc of procs){
    const tasks = proc.tasks||[];
    add(`### ${proc.id}: ${proc.name||''}`); add('');
    if(proc.trigger||proc.outcome){
      add(`**触发**: ${proc.trigger||'—'}  →  **预期结果**: ${proc.outcome||'—'}`); add('');
    }
    if(tasks.length){
      /* 复用 buildProcMermaid，带颜色 */
      const procCode = buildProcMermaid(proc);
      if(procCode){ add('```mermaid'); procCode.split('\n').forEach(l=>add(l)); add('```'); add(''); }

      for(const t of tasks){
        add(`#### ${t.id}. ${t.name||''}（角色：${t.role||''}）`); add('');
        if(t.repeatable) { add('> ↺ 可重复任务'); add(''); }
        if(t.steps?.length){
          add('| # | 步骤 | 类型 | 条件/备注 |'); add('|---|------|------|----------|');
          t.steps.forEach((s,i)=>add(`| ${i+1} | ${s.name||''} | ${STEP_LBL[s.type]||s.type||''} | ${s.note||''} |`));
          add('');
        }
        const eops=t.entity_ops||[];
        if(eops.length){
          const ep=eops.map(eo=>{
            const en=(emap[eo.entity_id]?.name)||eo.entity_id;
            return `${en}（${(eo.ops||[]).join(',')}）`;
          });
          add(`**涉及实体**: ${ep.join(', ')}`); add('');
        }
        if(t.rules_note?.trim()){ add(`**业务规则**: ${t.rules_note}`); add(''); }
        add('');
      }
    }
  }
  sep();

  const entities  = doc.entities||[];
  const relations = doc.relations||[];
  if(entities.length){
    add(`## ${nums[sn++]}、数据建模`); add('');
    const entityCode = buildEntityMermaid(doc);
    if(entityCode){ add('```mermaid'); entityCode.split('\n').forEach(l=>add(l)); add('```'); add(''); }
    for(const e of entities){
      add(`### 实体：${e.name||''}`); add('');
      if(e.note) { add(e.note); add(''); }
      if(e.fields?.length){
        add('| 字段 | 类型 | 主键 | 状态字段 | 公式/约束 |');
        add('|------|------|------|---------|---------|');
        e.fields.forEach(f=>add(`| ${f.name||''} | ${FIELD_LBL[f.type]||f.type||''} | ${f.is_key?'✓':''} | ${f.is_status?'✓':''} | ${f.note||''} |`));
        add('');
      }
    }
    sep();
  }

  return L.join('\n');
}

async function doRenderPreview(md) {
  const container = document.getElementById('preview-rendered');
  if(!container) return;
  const {html, diagrams} = renderBmlMd(md);
  container.innerHTML = html;
  setPreviewHint(diagrams.length ? '离线渲染' : '离线渲染');

  /* 渲染 mermaid 图表（联网时自动生效，离线时降级显示代码） */
  const blocks = container.querySelectorAll('.md-mermaid');
  for(const block of blocks) {
    const idx  = parseInt(block.dataset.idx);
    const code = diagrams[idx];
    if(!code) continue;
    if(window.mermaidLib) {
      try {
        const {svg} = await window.mermaidLib.render(`bpv-${idx}-${Date.now()}`, code);
        block.innerHTML = svg;
      } catch(e) {
        block.innerHTML = `<pre class="md-code">${esc(code)}</pre>`;
      }
    } else {
      block.innerHTML = `<pre class="md-code">${esc(code)}</pre>`;
    }
  }
}

function setPreviewHint(msg) {
  const el = document.getElementById('preview-mode-hint'); if(el) el.textContent = msg;
}
function togglePreviewRaw() {
  const rendered = document.getElementById('preview-rendered');
  const raw      = document.getElementById('preview-raw');
  if(!rendered || !raw) return;
  const goRaw = !rendered.classList.contains('hidden');
  rendered.classList.toggle('hidden', goRaw);
  raw.classList.toggle('hidden', !goRaw);
}

/* ═══════════════════════════════════════════════════════════
   COMMANDS
═══════════════════════════════════════════════════════════ */
const App = {
  cmdNew() {
    document.getElementById('new-doc-name').value='';
    document.getElementById('modal-overlay').classList.remove('hidden');
    setTimeout(()=>document.getElementById('new-doc-name')?.focus(),50);
  },
  closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); },
  async confirmNew() {
    const name=document.getElementById('new-doc-name').value.trim();
    if(!name) return alert('请输入名称');
    const res=await api.create(name); if(res.error) return alert(res.error);
    App.closeModal();
    const doc=await api.load(name);
    S.currentFile=name; S.doc=doc; S.modified=false;
    S.ui={tab:'domain', procId:doc.processes?.[0]?.id||null, taskId:null, entityId:null, sbCollapse:_defaultSbCollapse(doc), sidebarCollapsed:false};
    render();
  },

  async cmdOpen() {
    const files=await api.files();
    const fl=document.getElementById('file-list');
    fl.innerHTML=files.length
      ? files.map(f=>`
          <div class="file-list-item" onclick="App.openFile('${esc(f)}')">
            <span class="file-list-item-name">${esc(f)}</span>
            <button class="file-list-item-del"
              onclick="event.stopPropagation();App.deleteFile('${esc(f)}')" title="删除">✕</button>
          </div>`).join('')
      : `<div class="file-empty">暂无文档</div>`;
    document.getElementById('open-modal-overlay').classList.remove('hidden');
  },
  closeOpenModal() { document.getElementById('open-modal-overlay').classList.add('hidden'); },
  async openFile(name) {
    App.closeOpenModal();
    const doc=await api.load(name);
    /* 若 domain 为空，同步为文件名，避免保存时误触发重命名 */
    if(doc.meta && !doc.meta.domain) doc.meta.domain = name;
    S.currentFile=name; S.doc=doc; S.modified=false;
    S.ui={tab:'domain', procId:doc.processes?.[0]?.id||null, taskId:null, entityId:null, sbCollapse:_defaultSbCollapse(doc), sidebarCollapsed:false};
    render();
  },
  async deleteFile(name) {
    if(!confirm(`确认删除"${name}"？`)) return;
    await api.del(name);
    if(S.currentFile===name){S.currentFile=null;S.doc=null;S.modified=false;render();}
    await App.cmdOpen();
  },

  async cmdSave() {
    if(!S.doc||!S.currentFile) return;
    const newDomain=(S.doc.meta?.domain||'').trim();
    if(newDomain && newDomain!==S.currentFile) {
      /* 业务域改名 → 先存新文件，确认后再删旧文件 */
      await api.save(newDomain, S.doc);
      if(confirm(`文档将另存为"${newDomain}"，是否同时删除旧文件"${S.currentFile}"？`)) {
        await api.del(S.currentFile);
      }
      S.currentFile=newDomain;
    } else {
      await api.save(S.currentFile, S.doc);
    }
    S.modified=false;
    document.getElementById('modified-dot')?.classList.add('hidden');
    renderToolbar();
    if(S.ui.tab==='domain') renderDomainTab();
  },

  async cmdExport() {
    if(!S.currentFile) return;
    await App.cmdSave();
    const md=await api.exportMd(S.currentFile);
    const blob=new Blob([md],{type:'text/plain;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`${S.currentFile}.md`;
    a.click();
  }
};

/* ═══════════════════════════════════════════════════════════
   KEYBOARD
═══════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();App.cmdSave();}
});

document.addEventListener('DOMContentLoaded', ()=>render());
