'use strict';

function buildProcMermaid(proc) {
  const tasks = getProcNodes(proc);
  if(!tasks.length) return null;

  const roleMap = {};
  let colorIdx = 0;
  for(const t of tasks) {
    const r = getTaskRoleName(t);
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
    const roleName = getTaskRoleName(t);
    let label = `${name}${repeat}`;
    if(roleName) label += `\\n(${roleName})`;
    const ci = roleMap[roleName];
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
  const tasks = getProcNodes(proc);
  if(!tasks.length) { el.innerHTML=`<div class="diag-empty">暂无任务，点击上方"添加任务"</div>`; initZoom(containerId); return; }

  /* 角色→颜色 */
  const roleMap = {};
  let ci = 0;
  for(const t of tasks) {
    const r = getTaskRoleName(t);
    if(!(r in roleMap)) roleMap[r] = ci++ % ROLE_COLORS.length;
  }

  let h = '<div class="pf-wrap">';
  h += `<div class="pf-se">开始</div>`;

  for(const t of tasks) {
    const roleName = getTaskRoleName(t);
    const idx = roleMap[roleName];
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
    if(roleName) h += `<div class="pf-tr">(${esc(roleName)})</div>`;
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

/* ── Card Map 常量 ── */
const CARD_W = 300;
const CARD_H = 200;
const OV_CARD_W = 180;
const OV_CARD_H = 72;
function _cardGridW() { return (S.ui.procView || 'list') === 'list' ? OV_CARD_W : CARD_W; }
function _cardGridH() { return (S.ui.procView || 'list') === 'list' ? OV_CARD_H : CARD_H; }
let dragState = null;


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

function addProcess(subDomain) {
  const id  = nextId('P', S.doc.processes);
  const pos = _nextFreePos(S.doc.processes, null); /* 自动填补空缺格子 */
  S.doc.processes.push({id, name:'\u65b0\u6d41\u7a0b', subDomain:subDomain||'', flowGroup:'', trigger:'', outcome:'', nodes:[], pos});
  hydrateDocumentForUi(S.doc);
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
  const allTasks=S.doc.processes.flatMap(p=>getProcNodes(p));
  const id=nextId('T',allTasks);
  getProcNodes(proc).push({id, name:'\u65b0\u8282\u70b9', role_id:'', role:'', userSteps:[], orchestrationTasks:[], entity_ops:[], repeatable:false, rules_note:''});
  hydrateDocumentForUi(S.doc);
  markModified();
  navigate('process',{procId, taskId:id});
}
function removeTask(procId,taskId) {
  const proc=S.doc.processes.find(p=>p.id===procId); if(!proc) return;
  proc.nodes=getProcNodes(proc).filter(t=>t.id!==taskId);
  if(S.ui.taskId===taskId) S.ui.taskId=null;
  S.ui.orchestrationOpen = false;
  markModified(); render();
}
function moveTask(procId,taskId,dir) {
  const proc=S.doc.processes.find(p=>p.id===procId); if(!proc) return;
  const nodes = getProcNodes(proc);
  const idx=nodes.findIndex(t=>t.id===taskId);
  const nidx=idx+dir;
  if(nidx<0||nidx>=nodes.length) return;
  [nodes[idx],nodes[nidx]]=[nodes[nidx],nodes[idx]];
  markModified(); render();
}
function setTask(procId,taskId,key,val) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(t){t[key]=val; markModified();}
}

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Steps
═══════════════════════════════════════════════════════════ */
function addStep(procId,taskId) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(!t) return;
  getNodeUserSteps(t).push({name:'',type:'Query',note:''}); markModified(); render();
}
function removeStep(procId,taskId,idx) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(!t) return; getNodeUserSteps(t).splice(idx,1); markModified(); render();
}
function setStep(procId,taskId,idx,key,val) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(getNodeUserSteps(t)[idx]!==undefined){getNodeUserSteps(t)[idx][key]=val; markModified();}
}

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Entity Ops
═══════════════════════════════════════════════════════════ */
function addEntityOp(procId,taskId,entityId) {
  if(!entityId) return;
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(!t) return;
  if(!t.entity_ops) t.entity_ops=[];
  if(t.entity_ops.some(eo=>eo.entity_id===entityId)) return;
  t.entity_ops.push({entity_id:entityId, ops:['R']});
  markModified(); render();
}
function removeEntityOp(procId,taskId,entityId) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(!t) return; t.entity_ops=(t.entity_ops||[]).filter(eo=>eo.entity_id!==entityId);
  markModified(); render();
}
function toggleEntityOp(procId,taskId,entityId,op,checked) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  const eo=t?.entity_ops?.find(eo=>eo.entity_id===entityId);
  if(!eo) return;
  if(checked){if(!eo.ops.includes(op))eo.ops.push(op);}
  else{eo.ops=eo.ops.filter(o=>o!==op);}
  markModified();
}

function openOrchestrationPanel(procId, taskId) {
  S.ui.procId = procId;
  S.ui.taskId = taskId;
  S.ui.orchestrationOpen = true;
  renderProcessTab();
}
function closeOrchestrationPanel() {
  S.ui.orchestrationOpen = false;
  renderProcessTab();
}
function addOrchestrationTask(procId, taskId) {
  const node = getProcNodes(S.doc.processes.find(p => p.id === procId)).find(t => t.id === taskId);
  if (!node) return;
  getNodeOrchestrationTasks(node).push({
    name: '',
    type: 'Query',
    querySourceKind: 'Dictionary',
    target: '',
    note: '',
  });
  markModified();
  renderProcessTab();
}
function removeOrchestrationTask(procId, taskId, idx) {
  const node = getProcNodes(S.doc.processes.find(p => p.id === procId)).find(t => t.id === taskId);
  if (!node) return;
  getNodeOrchestrationTasks(node).splice(idx, 1);
  markModified();
  renderProcessTab();
}
function setOrchestrationTask(procId, taskId, idx, key, val) {
  const node = getProcNodes(S.doc.processes.find(p => p.id === procId)).find(t => t.id === taskId);
  const item = getNodeOrchestrationTasks(node)[idx];
  if (!item) return;
  item[key] = val;
  if (key === 'type' && val !== 'Query') item.querySourceKind = '';
  if (key === 'type' && val === 'Query' && !item.querySourceKind) item.querySourceKind = 'Dictionary';
  markModified();
}

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
   RENDER — Process Tab  (上：实时图 | 下：编辑)
═══════════════════════════════════════════════════════════ */
function buildRoleUsecaseMap(selectedRole) {
  const roleGroups = getGroupedRoles();
  const processes = S.doc?.processes || [];
  const subdomainGroups = Array.from(
    processes.reduce((map, proc) => {
      const subDomain = (proc.subDomain || '未归类业务子域').trim();
      if(!map.has(subDomain)) map.set(subDomain, []);
      map.get(subDomain).push(proc);
      return map;
    }, new Map()).entries(),
  ).map(([name, items]) => ({ name, items }));

  const roleFrames = [];
  const roleNodes = [];
  let roleY = 24;
  for(const group of roleGroups) {
    const frameHeight = 48 + group.roles.length * 46;
    roleFrames.push({ name: group.name, x: 24, y: roleY, width: 250, height: frameHeight });
    group.roles.forEach((role, index) => {
      roleNodes.push({
        role,
        x: 42,
        y: roleY + 34 + index * 42,
        width: 214,
        height: 32,
      });
    });
    roleY += frameHeight + 18;
  }

  const processFrames = [];
  const processNodes = [];
  const columnX = [340, 650];
  const columnHeights = [24, 24];
  for(const group of subdomainGroups) {
    const frameHeight = 52 + group.items.length * 40;
    const columnIndex = columnHeights[0] <= columnHeights[1] ? 0 : 1;
    const frameX = columnX[columnIndex];
    const frameY = columnHeights[columnIndex];
    processFrames.push({ name: group.name, x: frameX, y: frameY, width: 270, height: frameHeight });
    group.items.forEach((proc, index) => {
      processNodes.push({
        proc,
        x: frameX + 18,
        y: frameY + 34 + index * 36,
        width: 234,
        height: 28,
      });
    });
    columnHeights[columnIndex] += frameHeight + 18;
  }

  const canvasHeight = Math.max(roleY, ...columnHeights) + 24;
  const usageByProcess = selectedRole ? getRoleUsageByProcess(selectedRole.id) : new Map();
  const selectedNode = selectedRole ? roleNodes.find((node) => node.role.id === selectedRole.id) : null;

  const lines = selectedNode ? processNodes
    .filter((node) => usageByProcess.has(node.proc.id))
    .map((node) => {
      const taskCount = usageByProcess.get(node.proc.id).tasks.length;
      const startX = selectedNode.x + selectedNode.width;
      const startY = selectedNode.y + selectedNode.height / 2;
      const endX = node.x;
      const endY = node.y + node.height / 2;
      const midX = startX + (endX - startX) / 2;
      return {
        path: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
        taskCount,
        labelX: midX + 4,
        labelY: endY - 6,
      };
    })
    : [];

  return `<div class="role-usecase-map-wrap" data-testid="role-usecase-map">
    <div class="role-usecase-map-canvas" style="min-width:980px;height:${canvasHeight}px">
      <svg class="role-usecase-map-svg" width="980" height="${canvasHeight}" viewBox="0 0 980 ${canvasHeight}" preserveAspectRatio="none">
        ${lines.map((line) => `
          <path d="${line.path}" class="role-usecase-line"></path>
          <text x="${line.labelX}" y="${line.labelY}" class="role-usecase-line-label">${line.taskCount}T</text>
        `).join('')}
      </svg>
      ${roleFrames.map((frame) => `
        <div class="role-usecase-group role-side-group" style="left:${frame.x}px;top:${frame.y}px;width:${frame.width}px;height:${frame.height}px">
          <div class="role-usecase-group-title">${esc(frame.name)}</div>
        </div>
      `).join('')}
      ${processFrames.map((frame) => `
        <div class="role-usecase-group role-proc-group" style="left:${frame.x}px;top:${frame.y}px;width:${frame.width}px;height:${frame.height}px">
          <div class="role-usecase-group-title">${esc(frame.name)}</div>
        </div>
      `).join('')}
      ${roleNodes.map((node) => {
        const active = selectedRole?.id === node.role.id ? ' active' : '';
        const usage = getRoleUsageSummary(node.role.id);
        return `<button class="role-usecase-role${active}" data-role-id="${esc(node.role.id)}"
          style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px"
          onclick="S.ui.roleId='${esc(node.role.id)}';renderProcessTab()">
          <span class="role-usecase-role-name">${esc(node.role.name)}</span>
          <span class="role-usecase-role-meta">${usage.processCount}P · ${usage.taskCount}T</span>
        </button>`;
      }).join('')}
      ${processNodes.map((node) => {
        const linked = usageByProcess.has(node.proc.id) ? ' linked' : '';
        const taskCount = usageByProcess.has(node.proc.id) ? usageByProcess.get(node.proc.id).tasks.length : 0;
        return `<button class="role-usecase-process${linked}" data-process-id="${esc(node.proc.id)}"
          style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px"
          onclick="navigate('process',{procId:'${esc(node.proc.id)}',taskId:null})">
          <span class="role-usecase-process-name">${esc(node.proc.id)} ${esc(node.proc.name || '未命名流程')}</span>
          ${taskCount ? `<span class="role-usecase-process-count">${taskCount}T</span>` : ''}
        </button>`;
      }).join('')}
    </div>
  </div>`;
}

function renderProcessRoleView() {
  const roles = getRoles();
  ensureSelectedRole();
  const selectedRole = getRoleById(S.ui.roleId);
  if(!roles.length) {
    return `<div class="proc-role-empty" data-testid="process-role-view">
      <p>暂无角色词典，请先到业务域页新增角色。</p>
      <button class="btn btn-outline btn-sm" onclick="navigate('domain')">前往角色管理</button>
    </div>`;
  }

  const usageByProcess = selectedRole ? getRoleUsageByProcess(selectedRole.id) : new Map();
  const selectedSummary = selectedRole ? getRoleUsageSummary(selectedRole.id) : { processCount: 0, taskCount: 0 };

  const detail = selectedRole ? `
    <div class="proc-role-detail-head">
      <div>
        <div class="proc-role-detail-title">${esc(selectedRole.name)}</div>
        <div class="proc-role-detail-subtitle">${selectedRole.desc ? esc(selectedRole.desc) : '当前角色的流程与任务投影视图'} · 分组：${esc(getRoleGroupName(selectedRole))}</div>
      </div>
      <div class="proc-role-detail-badges">
        <span class="proc-role-badge">流程 ${selectedSummary.processCount}</span>
        <span class="proc-role-badge">任务 ${selectedSummary.taskCount}</span>
      </div>
    </div>
    ${usageByProcess.size ? Array.from(usageByProcess.values()).map(({ proc, tasks }) => `
      <div class="proc-role-usage-card">
        <div class="proc-role-usage-head">
          <div>
            <span class="proc-role-usage-proc">${esc(proc.id)} ${esc(proc.name || '未命名流程')}</span>
            ${proc.subDomain ? `<span class="proc-role-usage-subdomain">${esc(proc.subDomain)}</span>` : ''}
          </div>
          <button class="btn btn-ghost-sm" onclick="navigate('process',{procId:'${esc(proc.id)}',taskId:null})">查看流程</button>
        </div>
        <div class="proc-role-task-list">
          ${tasks.map((task) => `<button class="role-task-chip" data-testid="role-view-task-chip"
            onclick="navigate('process',{procId:'${esc(proc.id)}',taskId:'${esc(task.id)}'})">
            ${esc(task.id)} ${esc(task.name || '未命名任务')}
          </button>`).join('')}
        </div>
      </div>
    `).join('') : '<p class="no-refs">当前角色尚未被任何任务引用</p>'}
  ` : '<p class="no-refs">请选择一个角色查看流程投影</p>';

  return `<div class="proc-role-view" data-testid="process-role-view">
    <div class="proc-role-map-panel">
      <div class="proc-role-map-head">
        <div>
          <div class="proc-role-map-title">角色用例图</div>
          <div class="proc-role-map-subtitle">全局展示角色参与的流程模板。点击左侧角色可高亮它参与的流程，点击流程可进入编辑。</div>
        </div>
        ${selectedRole ? `<div class="proc-role-map-focus">当前高亮：${esc(selectedRole.name)}</div>` : ''}
      </div>
      ${buildRoleUsecaseMap(selectedRole)}
    </div>
    <div class="proc-role-detail">${detail}</div>
  </div>`;
}

function renderProcessTab() {
  ensureProcPos(S.doc);
  const procs=S.doc.processes||[];
  const proc=currentProc();
  const task=currentTask();
  const view=S.ui.procView||'card';

  /* ── 视图切换工具栏 ── */
  let h=`<div class="proc-view-toolbar">
    <div class="view-toggle-group">
      <button class="vtb ${view==='card'?'active':''}" data-testid="process-switch-card" onclick="setProcView('card')">卡片视图</button>
      <button class="vtb ${view==='list'?'active':''}" data-testid="process-switch-overview" onclick="setProcView('list')">概要视图</button>
      <button class="vtb ${view==='role'?'active':''}" data-testid="process-switch-role" onclick="setProcView('role')">角色视图</button>
    </div>
    ${view==='list'&&proc?`<button class="btn btn-ghost-sm" data-testid="process-delete-button" onclick="removeProcess('${proc.id}')">删除流程</button>`:''}
    ${view==='list'?`<button class="btn btn-outline btn-sm" data-testid="process-add-button" onclick="addProcess()">＋ 新流程</button>`:''}
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
    h+=`<div class="card-view-area" data-testid="process-card-view">
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

  if(view==='role') {
    h += renderProcessRoleView();
    document.getElementById('tab-content').innerHTML = h;
    return;
  }

  /* ══ 概要视图：映射网格（全高）+ 右侧抽屉编辑 ══ */
  const ovMaxRow=Math.max(...procs.map(p=>p.pos?.r||1));
  const ovMaxCol=Math.max(...procs.map(p=>p.pos?.c||1));
  h+=`<div class="ov-map-wrap ov-full" data-testid="process-overview-view">
    <div id="card-map" class="ov-map"
      style="height:${ovMaxRow*OV_CARD_H+8}px;min-width:${Math.max(ovMaxCol*OV_CARD_W+8,400)}px">`;
  for(const p of procs) {
    const r=p.pos?.r||1, c=p.pos?.c||1;
    const taskCnt=getProcNodes(p).length;
    const stepCnt=getProcNodes(p).reduce((n,t)=>n+(getNodeUserSteps(t).length||0),0);
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
  const drawerW = getDrawerWidth('process');
  h+=`<div class="proc-drawer${proc?' open':''}" style="width:${drawerW}px">
    <div class="drawer-resize-handle" data-testid="process-drawer-resize-handle" onmousedown="startDrawerResize(event)"></div>`;

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
        ${!task?`<button class="btn btn-outline btn-sm" onclick="addTask('${esc(proc.id)}')">\uff0b\u8282\u70b9</button>`:''}
        ${!task?`<button class="btn btn-ghost-sm" onclick="removeProcess('${esc(proc.id)}')">删除流程</button>`:''}
        ${task?`<button class="btn btn-danger btn-sm" onclick="removeTask('${esc(proc.id)}','${esc(task.id)}')">\u5220\u9664\u8282\u70b9</button>`:''}
        <button class="drawer-close" onclick="navigate('process',{procId:null,taskId:null})" title="关闭抽屉">✕</button>
      </div>
    </div>`;

    /* 流程图（小图） */
    h+=`<div class="drawer-diag">
      <div class="drawer-diag-bar">
        <span class="live-diagram-hint">\u70b9\u51fb\u8282\u70b9\u8fdb\u5165\u7f16\u8f91</span>
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
          <label>\u8282\u70b9\u540d\u79f0</label>
          <input type="text" value="${esc(task.name||'')}" placeholder="\u5982\uff1a\u5f55\u5165\u91c7\u8d2d\u5355"
            oninput="setTask('${esc(proc.id)}','${esc(task.id)}','name',this.value);renderSidebar();renderProcDiagramNow()">
        </div>
        <div class="field-group">
          <label>执行角色</label>`;

      const taskRoleId = getTaskRoleId(task);
      const roles = getRoles();
      if(roles.length) {
        h+=`<div class="task-role-picker">
          <select data-testid="task-role-select" onchange="onRoleChange(this,'${esc(proc.id)}','${esc(task.id)}')">
            <option value="">请选择...</option>
            ${roles.map((role) => `<option value="${esc(role.id)}" ${taskRoleId===role.id?'selected':''}>${esc(role.name)}</option>`).join('')}
          </select>
          <button class="btn btn-ghost-sm" type="button" onclick="navigate('domain')">管理角色</button>
        </div>`;
      } else {
        h+=`<div class="task-role-picker-empty">
          <span class="no-refs">暂无角色词典，请先到业务域页添加角色</span>
          <button class="btn btn-outline btn-sm" type="button" onclick="navigate('domain')">前往角色管理</button>
        </div>`;
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
        <h4>\u7528\u6237\u64cd\u4f5c\u6b65\u9aa4 <button class="btn btn-outline btn-sm" onclick="addStep('${esc(proc.id)}','${esc(task.id)}')">\uff0b</button></h4>`;
      const userSteps = getNodeUserSteps(task);
      if(userSteps.length){
        h+=`<div class="step-list">`;
        userSteps.forEach((s,i)=>{
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
        <textarea rows="3" placeholder="\u5982\uff1a\u91d1\u989d>10000\u9700\u4e3b\u7ba1\u5ba1\u6279"
          oninput="setTask('${esc(proc.id)}','${esc(task.id)}','rules_note',this.value)"
          >${esc(task.rules_note||'')}</textarea>
      </div>`;

      const orchestrationTasks = getNodeOrchestrationTasks(task);
      h+=`<div class="form-section">
        <h4>\u7f16\u6392\u4efb\u52a1</h4>
        <div class="node-summary-row">
          <span class="node-summary-pill">${orchestrationTasks.length} \u9879</span>
          <button class="btn btn-outline btn-sm" onclick="openOrchestrationPanel('${esc(proc.id)}','${esc(task.id)}')">\u8fdb\u5165\u7f16\u6392\u4efb\u52a1</button>
        </div>
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
          <label>\u6d41\u7a0b\u7ec4</label>
          <input type="text" value="${esc(proc.flowGroup||'')}" placeholder="\u5982\uff1a\u4ed3\u5e93\u57fa\u7840\u7ef4\u62a4"
            oninput="setProc('${esc(proc.id)}','flowGroup',this.value);renderSidebar()">
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

  if(proc && task) {
    const orchestrationTasks = getNodeOrchestrationTasks(task);
    const open = !!S.ui.orchestrationOpen;
    h+=`<div class="proc-subdrawer${open?' open':''}">
      <div class="subdrawer-head">
        <div class="drawer-crumb">${esc(proc.name||'')} / ${esc(task.name||'')} / \u7f16\u6392\u4efb\u52a1</div>
        <button class="drawer-close" onclick="closeOrchestrationPanel()" title="\u5173\u95ed">\u2715</button>
      </div>
      <div class="subdrawer-body">
        <div class="subdrawer-toolbar">
          <span class="section-hint">\u4ece\u7814\u53d1\u5b9e\u73b0\u89c6\u89d2\u62c6\u89e3\u8282\u70b9\u7684\u670d\u52a1\u7f16\u6392</span>
          <button class="btn btn-outline btn-sm" onclick="addOrchestrationTask('${esc(proc.id)}','${esc(task.id)}')">\uff0b\u7f16\u6392\u4efb\u52a1</button>
        </div>
        ${orchestrationTasks.length ? `<div class="orch-list">${orchestrationTasks.map((item, index) => `
          <div class="orch-card">
            <div class="orch-row">
              <input type="text" value="${esc(item.name||'')}" placeholder="\u5982\uff1a\u6821\u9a8c\u5e93\u5b58\u4f59\u989d"
                oninput="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'name',this.value)">
              <select onchange="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'type',this.value);renderProcessTab()">
                ${ORCHESTRATION_TYPES.map((option) => `<option value="${option.value}" ${item.type===option.value?'selected':''}>${option.label}</option>`).join('')}
              </select>
              <button class="step-del" onclick="removeOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index})">\u2715</button>
            </div>
            <div class="orch-row">
              ${item.type==='Query' ? `<select onchange="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'querySourceKind',this.value)">${QUERY_SOURCE_KINDS.map((option) => `<option value="${option.value}" ${item.querySourceKind===option.value?'selected':''}>${option.label}</option>`).join('')}</select>` : '<span class="orch-spacer"></span>'}
              <input type="text" value="${esc(item.target||'')}" placeholder="\u76ee\u6807\u670d\u52a1 / \u5b57\u5178 / \u679a\u4e3e"
                oninput="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'target',this.value)">
            </div>
            <textarea class="auto-resize" rows="2" placeholder="\u5907\u6ce8\uff1a\u8f93\u5165\u8f93\u51fa\uff0c\u524d\u7f6e\u6761\u4ef6\uff0c\u5f02\u5e38\u5904\u7406" oninput="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'note',this.value);autoResize(this)">${esc(item.note||'')}</textarea>
          </div>`).join('')}</div>` : '<p class="no-refs">\u6682\u65e0\u7f16\u6392\u4efb\u52a1</p>'}
      </div>
    </div>`;
  }

  document.getElementById('tab-content').innerHTML=h;

  /* 渲染流程图 */
  if(proc) {
    const clickMap={};
    for(const t of getProcNodes(proc))
      clickMap[t.id]=()=>navigate('process',{procId:proc.id,taskId:t.id});
    renderProcFlow('proc-diagram', proc, clickMap);
  }
}

/* 仅刷新流程图，不重建整个 DOM（输入框连续输入时用） */
function renderProcDiagramNow() {
  const proc=currentProc(); if(!proc) return;
  const clickMap={};
  for(const t of getProcNodes(proc))
    clickMap[t.id]=()=>navigate('process',{procId:proc.id,taskId:t.id});
  renderProcFlow('proc-diagram', proc, clickMap);
}

function onRoleChange(sel, procId, taskId) {
  setTaskRole(procId, taskId, sel.value);
  renderProcDiagramNow();
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
