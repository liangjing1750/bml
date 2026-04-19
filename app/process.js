'use strict';

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
