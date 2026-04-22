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

  for(const [index, t] of tasks.entries()) {
    const name = (t.name||'').replace(/"/g,"'");
    const roleName = getTaskRoleName(t);
    let label = `${name}`;
    if(roleName) label += `\\n(${roleName})`;
    const ci = roleMap[roleName];
    lines.push(`  ${t.id}["${label}"]:::rc${ci}`);
    if(t.repeatable && index > 0) {
      lines.push(`  ${t.id} -.-> ${tasks[index - 1].id}`);
    }
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

const PROC_RETURN_LINE_OFFSET = 20;
const PROC_RETURN_START_RATIO = 0.25;
const PROC_RETURN_END_RATIO = 0.75;

function renderProcReturnLines(wrap, tasks, overlayKey) {
  if(!wrap) return;
  const hasReturn = tasks.some((task, index) => index > 0 && task?.repeatable);
  if(!hasReturn) {
    wrap.classList.remove('pf-wrap-has-return');
    return;
  }
  wrap.classList.add('pf-wrap-has-return');
  const wrapRect = wrap.getBoundingClientRect();
  if(!wrapRect.width || !wrapRect.height) return;

  const cols = Array.from(wrap.querySelectorAll('.pf-col[data-id]'));
  const returnSpecs = [];

  for(let index = 1; index < tasks.length; index++) {
    const task = tasks[index];
    if(!task?.repeatable) continue;
    const currentCol = cols[index];
    const prevCol = cols[index - 1];
    const currentTask = currentCol?.querySelector('.pf-task');
    const prevTask = prevCol?.querySelector('.pf-task');
    if(!currentTask || !prevTask) continue;

    const currentRect = currentTask.getBoundingClientRect();
    const prevRect = prevTask.getBoundingClientRect();
    const startX = currentRect.left - wrapRect.left + currentRect.width * PROC_RETURN_START_RATIO;
    const startY = currentRect.top - wrapRect.top;
    const endX = prevRect.left - wrapRect.left + prevRect.width * PROC_RETURN_END_RATIO;
    const endY = prevRect.top - wrapRect.top;
    const laneY = Math.max(10, Math.min(startY, endY) - PROC_RETURN_LINE_OFFSET);
    returnSpecs.push({
      from: task.id,
      to: tasks[index - 1].id,
      points: [
        `${startX},${startY}`,
        `${startX},${laneY}`,
        `${endX},${laneY}`,
        `${endX},${endY}`,
      ].join(' '),
    });
  }

  if(!returnSpecs.length) {
    wrap.classList.remove('pf-wrap-has-return');
    return;
  }

  const markerId = `pf-return-arrow-${String(overlayKey || 'default').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const svgNs = 'http://www.w3.org/2000/svg';
  const overlay = document.createElementNS(svgNs, 'svg');
  overlay.setAttribute('class', 'pf-return-overlay');
  overlay.setAttribute('width', String(wrap.scrollWidth));
  overlay.setAttribute('height', String(wrap.scrollHeight));
  overlay.setAttribute('viewBox', `0 0 ${wrap.scrollWidth} ${wrap.scrollHeight}`);
  overlay.setAttribute('aria-hidden', 'true');

  const defs = document.createElementNS(svgNs, 'defs');
  const marker = document.createElementNS(svgNs, 'marker');
  marker.setAttribute('id', markerId);
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('refX', '8');
  marker.setAttribute('refY', '4');
  marker.setAttribute('orient', 'auto');
  marker.setAttribute('markerUnits', 'strokeWidth');
  const arrowPath = document.createElementNS(svgNs, 'path');
  arrowPath.setAttribute('d', 'M0,0 L8,4 L0,8');
  arrowPath.setAttribute('fill', 'none');
  arrowPath.setAttribute('stroke', '#94a3b8');
  arrowPath.setAttribute('stroke-width', '1.7');
  arrowPath.setAttribute('stroke-linecap', 'round');
  arrowPath.setAttribute('stroke-linejoin', 'round');
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  overlay.appendChild(defs);

  for(const spec of returnSpecs) {
    const line = document.createElementNS(svgNs, 'polyline');
    line.setAttribute('class', 'pf-return-line');
    line.setAttribute('data-from', spec.from);
    line.setAttribute('data-to', spec.to);
    line.setAttribute('points', spec.points);
    line.setAttribute('fill', 'none');
    line.setAttribute('marker-end', `url(#${markerId})`);
    overlay.appendChild(line);
  }

  wrap.appendChild(overlay);
}

function syncTaskReturnableToggle(root = document) {
  const toggle = root.querySelector('[data-testid="task-returnable-toggle"]');
  if(!toggle) return;
  const label = toggle.closest('label');
  if(!label) return;

  for(const node of Array.from(label.childNodes)) {
    if(node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      node.textContent = ' ';
    }
  }

  let title = label.querySelector('.task-returnable-label');
  if(!title) {
    title = document.createElement('span');
    title.className = 'task-returnable-label';
    label.insertBefore(title, toggle);
  }
  title.textContent = '\u53ef\u9000\u56de';

  const helper = Array.from(label.querySelectorAll('span'))
    .find((item) => !item.classList.contains('task-returnable-label'));
  if(helper) {
    helper.classList.add('task-returnable-hint');
    helper.textContent = '\u5f53\u524d\u8282\u70b9\u5141\u8bb8\u9000\u56de\u4e0a\u4e00\u8282\u70b9\u91cd\u65b0\u5904\u7406';
  }
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
    const clickable = onClickMap?.[t.id] ? ' pf-clickable' : '';

    h += `<div class="pf-arrow">→</div>`;
    h += `<div class="pf-col" data-id="${t.id}">`;
    /* 任务节点 */
    h += `<div class="pf-task${clickable}" data-id="${t.id}"
      style="background:${c.fill};border-color:${c.stroke};color:${c.color}">`;
    h += `<div class="pf-tn">${esc(t.name||'')}</div>`;
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
  const wrap = el.querySelector('.pf-wrap');
  renderProcReturnLines(wrap, tasks, containerId);

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
  S.doc.processes.push({id, name:'\u65b0\u6d41\u7a0b', subDomain:subDomain||'', flowGroup:'', trigger:'', outcome:'', prototypeFiles:[], nodes:[], pos});
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

function formatPrototypeInputId(procId) {
  return `proc-prototype-input-${String(procId || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function findProcessPrototypeFile(proc, prototypeUid) {
  return getProcPrototypeFiles(proc).find((file) => file.uid === prototypeUid) || null;
}

async function addProcessPrototypeFiles(procId, inputId) {
  const proc = S.doc.processes.find((item) => item.id === procId);
  const input = document.getElementById(inputId);
  if (!proc || !input?.files?.length) return;

  const selectedFiles = Array.from(input.files);
  const invalidFiles = selectedFiles.filter((file) => {
    const fileName = String(file?.name || '');
    return !/\.html?$/i.test(fileName) && String(file?.type || '').toLowerCase() !== 'text/html';
  });
  if (invalidFiles.length) {
    alert(`仅支持上传 HTML 原型文件：${invalidFiles.map((file) => file.name).join('、')}`);
    input.value = '';
    return;
  }

  const uploadedFiles = await Promise.all(selectedFiles.map(async (file) => ({
    uid: createUiUid('proto'),
    name: String(file.name || '').trim() || '未命名原型.html',
    content: await file.text(),
    contentType: String(file.type || 'text/html').trim() || 'text/html',
  })));
  const prototypeFiles = getProcPrototypeFiles(proc);
  const fileByName = new Map(prototypeFiles.map((file) => [file.name, file]));
  for (const file of uploadedFiles) fileByName.set(file.name, file);
  proc.prototypeFiles = Array.from(fileByName.values());
  input.value = '';
  S.ui.procEditorFocusSelector = '[data-testid="proc-prototype-upload-button"]';
  markModified();
  rerenderProcessEditor({ focusSelector: '[data-testid="proc-prototype-upload-button"]' });
}

function removeProcessPrototypeFile(procId, prototypeUid) {
  const proc = S.doc.processes.find((item) => item.id === procId);
  if (!proc) return;
  const prototypeFiles = getProcPrototypeFiles(proc);
  const nextFiles = prototypeFiles.filter((file) => file.uid !== prototypeUid);
  if (nextFiles.length === prototypeFiles.length) return;
  proc.prototypeFiles = nextFiles;
  S.ui.procEditorFocusSelector = '[data-testid="proc-prototype-upload-button"]';
  markModified();
  rerenderProcessEditor({ focusSelector: '[data-testid="proc-prototype-upload-button"]' });
}

function openProcessPrototypeFile(procId, prototypeUid) {
  const proc = S.doc.processes.find((item) => item.id === procId);
  const prototypeFile = findProcessPrototypeFile(proc, prototypeUid);
  if (!prototypeFile) return;
  const contentType = String(prototypeFile.contentType || 'text/html').trim() || 'text/html';
  const blob = new Blob([prototypeFile.content || ''], {
    type: /charset=/i.test(contentType) ? contentType : `${contentType};charset=utf-8`,
  });
  const objectUrl = URL.createObjectURL(blob);
  const popup = window.open(objectUrl, '_blank');
  if (!popup) {
    URL.revokeObjectURL(objectUrl);
    alert('浏览器拦截了原型预览窗口，请允许弹窗后重试。');
    return;
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
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

function rerenderProcessEditor(options = {}) {
  const currentDrawerBody = document.querySelector('.proc-drawer .drawer-body');
  const drawerScrollTop = currentDrawerBody?.scrollTop || 0;
  const anchorSelector = options.anchorSelector || null;
  const anchorViewportTop = currentDrawerBody && anchorSelector
    ? (() => {
        const anchor = currentDrawerBody.querySelector(anchorSelector);
        if (!anchor) return null;
        return anchor.getBoundingClientRect().top - currentDrawerBody.getBoundingClientRect().top;
      })()
    : null;
  renderProcessTab();
  requestAnimationFrame(() => {
    const drawerBody = document.querySelector('.proc-drawer .drawer-body');
    if (typeof initAutoResize === 'function') initAutoResize();
    let finalScrollTop = options.drawerScrollTop ?? drawerScrollTop;
    if (drawerBody) drawerBody.scrollTop = finalScrollTop;
    if (options.focusSelector) {
      const field = document.querySelector(options.focusSelector);
      if (field) {
        if (typeof field.focus === 'function') {
          try {
            field.focus({ preventScroll: true });
          } catch (error) {
            field.focus();
          }
        }
        if (options.selectText !== false && typeof field.select === 'function') field.select();
        if (options.revealFocus) {
          field.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }
    }
    if (drawerBody && anchorSelector && anchorViewportTop !== null) {
      const anchor = drawerBody.querySelector(anchorSelector);
      if (anchor) {
        const nextAnchorViewportTop = anchor.getBoundingClientRect().top - drawerBody.getBoundingClientRect().top;
        finalScrollTop = Math.max(0, finalScrollTop + (nextAnchorViewportTop - anchorViewportTop));
        drawerBody.scrollTop = finalScrollTop;
      }
    }
    requestAnimationFrame(() => {
      const latestDrawerBody = document.querySelector('.proc-drawer .drawer-body');
      if (latestDrawerBody) latestDrawerBody.scrollTop = finalScrollTop;
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Steps
═══════════════════════════════════════════════════════════ */
function addStep(procId,taskId,afterIdx) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(!t) return;
  const steps = getNodeUserSteps(t);
  const insertIndex = Number.isInteger(afterIdx) ? afterIdx + 1 : steps.length;
  steps.splice(insertIndex, 0, {name:'',type:'Query',note:''});
  markModified();
  rerenderProcessEditor({
    focusSelector: `.step-row[data-step-index="${insertIndex}"] .step-name`,
  });
}
function removeStep(procId,taskId,idx) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(!t) return;
  getNodeUserSteps(t).splice(idx,1);
  markModified();
  rerenderProcessEditor();
}
function setStep(procId,taskId,idx,key,val) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(getNodeUserSteps(t)[idx]!==undefined){getNodeUserSteps(t)[idx][key]=val; markModified();}
}
function moveStep(procId,taskId,idx,dir) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(!t) return;
  const steps = getNodeUserSteps(t);
  const targetIdx = idx + dir;
  if(targetIdx < 0 || targetIdx >= steps.length) return;
  [steps[idx], steps[targetIdx]] = [steps[targetIdx], steps[idx]];
  markModified();
  rerenderProcessEditor({
    focusSelector: `.step-row[data-step-index="${targetIdx}"] .step-name`,
  });
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
  markModified();
  rerenderProcessEditor({
    anchorSelector: `#eop-sel-${taskId}`,
    focusSelector: `#eop-sel-${taskId}`,
  });
}
function removeEntityOp(procId,taskId,entityId) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(!t) return; t.entity_ops=(t.entity_ops||[]).filter(eo=>eo.entity_id!==entityId);
  markModified();
  rerenderProcessEditor({
    anchorSelector: `#eop-sel-${taskId}`,
    focusSelector: `#eop-sel-${taskId}`,
  });
}
function toggleEntityOp(procId,taskId,entityId,op,checked) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  const eo=t?.entity_ops?.find(eo=>eo.entity_id===entityId);
  if(!eo) return;
  if(checked){if(!eo.ops.includes(op))eo.ops.push(op);}
  else{eo.ops=eo.ops.filter(o=>o!==op);}
  markModified();
}

function setNodePerspective(view) {
  if(view !== 'user' && view !== 'engineering') return;
  S.ui.nodePerspective = view;
  rerenderProcessEditor({
    focusSelector: view === 'engineering'
      ? '[data-testid="orchestration-section"] .orch-name, [data-testid="orchestration-section"]'
      : '[data-testid="user-steps-section"] .step-name, [data-testid="user-steps-section"]',
  });
}
function addOrchestrationTask(procId, taskId, afterIdx) {
  const node = getProcNodes(S.doc.processes.find(p => p.id === procId)).find(t => t.id === taskId);
  if (!node) return;
  const orchestrationTasks = getNodeOrchestrationTasks(node);
  const insertIndex = Number.isInteger(afterIdx) ? afterIdx + 1 : orchestrationTasks.length;
  orchestrationTasks.splice(insertIndex, 0, {
    name: '',
    type: 'Query',
    querySourceKind: 'Dictionary',
    target: '',
    note: '',
  });
  markModified();
  rerenderProcessEditor({
    focusSelector: `.orch-card[data-orch-index="${insertIndex}"] .orch-name`,
  });
}
function removeOrchestrationTask(procId, taskId, idx) {
  const node = getProcNodes(S.doc.processes.find(p => p.id === procId)).find(t => t.id === taskId);
  if (!node) return;
  getNodeOrchestrationTasks(node).splice(idx, 1);
  markModified();
  rerenderProcessEditor();
}
function setOrchestrationTask(procId, taskId, idx, key, val) {
  const node = getProcNodes(S.doc.processes.find(p => p.id === procId)).find(t => t.id === taskId);
  const item = getNodeOrchestrationTasks(node)[idx];
  if (!item) return;
  item[key] = val;
  if (key === 'type' && val !== 'Query') item.querySourceKind = '';
  if (key === 'type' && val === 'Query' && !item.querySourceKind) item.querySourceKind = 'Dictionary';
  markModified();
  if ((S.ui.nodePerspective || 'user') === 'engineering') {
    renderProcDiagramNow();
  }
}
function moveOrchestrationTask(procId, taskId, idx, dir) {
  const node = getProcNodes(S.doc.processes.find(p => p.id === procId)).find(t => t.id === taskId);
  if (!node) return;
  const orchestrationTasks = getNodeOrchestrationTasks(node);
  const targetIdx = idx + dir;
  if(targetIdx < 0 || targetIdx >= orchestrationTasks.length) return;
  [orchestrationTasks[idx], orchestrationTasks[targetIdx]] = [orchestrationTasks[targetIdx], orchestrationTasks[idx]];
  markModified();
  rerenderProcessEditor({
    focusSelector: `.orch-card[data-orch-index="${targetIdx}"] .orch-name`,
  });
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

function buildOrchestrationFlowHtml(task) {
  const orchestrationTasks = getNodeOrchestrationTasks(task);
  if(!orchestrationTasks.length) {
    return `<div class="orch-flow-empty">暂无编排任务，先补充研发视角下的任务拆解。</div>`;
  }
  return `<div class="orch-flow-frame" data-testid="orchestration-flow">
    <div class="orch-flow-node-label">节点 ${esc(task.id)} · ${esc(task.name || '未命名节点')}</div>
    <div class="orch-flow-track">
      ${orchestrationTasks.map((item, index) => `
        <div class="orch-flow-item">
          <div class="orch-flow-card tone-${String(item.type || 'Custom').toLowerCase()}">
            <span class="orch-flow-index">${index + 1}</span>
            <div class="orch-flow-text">
              <strong>${esc(item.name || `任务 ${index + 1}`)}</strong>
              <span>${esc(item.target || (item.type === 'Query' ? '待补充查询目标' : '待补充执行目标'))}</span>
            </div>
          </div>
          ${index < orchestrationTasks.length - 1 ? '<div class="orch-flow-arrow">→</div>' : ''}
        </div>`).join('')}
    </div>
  </div>`;
}

function renderProcTaskFlow(containerId, proc, activeTaskId, onClickMap) {
  const el = document.getElementById(containerId);
  if(!el) return;
  const nodes = getProcNodes(proc);
  if(!nodes.length) {
    el.innerHTML = `<div class="diag-empty">暂无节点，先补充流程节点。</div>`;
    initZoom(containerId);
    return;
  }

  let html = `<div class="ptf-wrap" data-testid="global-orchestration-flow">
    <div class="ptf-se">开始</div>`;
  for(const node of nodes) {
    const orchestrationTasks = getNodeOrchestrationTasks(node);
    html += `<div class="ptf-outer-arrow">→</div>
      <div class="ptf-node-frame ${node.id === activeTaskId ? 'active' : ''}" data-id="${esc(node.id)}">
        <div class="ptf-node-head">
          <span class="ptf-node-id">${esc(node.id)}</span>
          <span class="ptf-node-name">${esc(node.name || '未命名节点')}</span>
        </div>
        <div class="ptf-node-track">`;
    if(orchestrationTasks.length) {
      orchestrationTasks.forEach((item, index) => {
        html += `<div class="ptf-task-item tone-${String(item.type || 'Custom').toLowerCase()}">
            <span class="ptf-task-index">${index + 1}</span>
            <div class="ptf-task-text">
              <strong>${esc(item.name || `任务 ${index + 1}`)}</strong>
              <span>${esc(item.target || '待补充目标')}</span>
            </div>
          </div>`;
        if(index < orchestrationTasks.length - 1) {
          html += `<div class="ptf-inner-arrow">→</div>`;
        }
      });
    } else {
      html += `<div class="ptf-empty">暂无编排任务</div>`;
    }
    html += `</div></div>`;
  }
  html += `<div class="ptf-outer-arrow">→</div>
    <div class="ptf-se">结束</div>
  </div>`;

  el.innerHTML = html;

  if(onClickMap) {
    for(const [nodeId, handler] of Object.entries(onClickMap)) {
      const nodeEl = el.querySelector(`.ptf-node-frame[data-id="${nodeId}"]`);
      if(nodeEl) {
        nodeEl.style.cursor = 'pointer';
        nodeEl.addEventListener('click', handler);
      }
    }
  }

  el.addEventListener('mousedown', (ev) => {
    if(ev.target.closest('.ptf-node-frame,.ptf-task-item,.ptf-se')) return;
    ev.preventDefault();
    startEfPan(el, ev);
  });

  initZoom(containerId);
  if(ZOOM[containerId] && ZOOM[containerId] !== 1) applyZoom(containerId);
}

function renderNodePerspectiveSwitch() {
  const perspective = S.ui.nodePerspective || 'user';
  return `<div class="node-perspective-switch" data-testid="node-perspective-switch">
    <button
      type="button"
      class="node-perspective-btn ${perspective === 'user' ? 'active' : ''}"
      data-testid="node-perspective-user"
      onclick="setNodePerspective('user')"
    >用户步骤视图</button>
    <button
      type="button"
      class="node-perspective-btn ${perspective === 'engineering' ? 'active' : ''}"
      data-testid="node-perspective-engineering"
      onclick="setNodePerspective('engineering')"
    >任务级视图</button>
  </div>`;
}

function renderUserStepsSection(proc, task) {
  const userSteps = getNodeUserSteps(task);
  return `<div class="form-section node-perspective-panel active" data-testid="user-steps-section">
    <div class="section-toolbar">
      <h4>用户步骤视图 <span class="section-count">${userSteps.length} 项</span></h4>
      <button class="btn btn-outline btn-sm" type="button" onclick="addStep('${esc(proc.id)}','${esc(task.id)}')">＋添加步骤</button>
    </div>
    <p class="section-hint">面向产品视角，描述页面上的查看、点击、填写、提交等用户动作。</p>
    ${userSteps.length ? `<div class="step-list">${userSteps.map((s, i) => `
      <div class="step-row" data-step-index="${i}">
        <div class="step-row-top">
          <span class="step-num">${i + 1}</span>
          <input class="step-name" type="text" value="${esc(s.name || '')}" placeholder="步骤描述"
            oninput="setStep('${esc(proc.id)}','${esc(task.id)}',${i},'name',this.value)">
          <select class="step-type" onchange="onStepTypeChange(this,'${esc(proc.id)}','${esc(task.id)}',${i})">
            ${STEP_TYPES.map((t) => `<option value="${t.value}" ${(t.value === '__other__' ? isCustomStepType(s.type) : s.type === t.value) ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
          ${isCustomStepType(s.type) ? `<input class="step-type-custom" type="text" value="${esc(s.type)}" placeholder="自定义类型"
            oninput="setStep('${esc(proc.id)}','${esc(task.id)}',${i},'type',this.value)">` : ''}
          <div class="step-actions">
            <button class="step-action step-add-after" type="button" title="在下方插入步骤" onclick="addStep('${esc(proc.id)}','${esc(task.id)}',${i})">+</button>
            <button class="step-action step-move-up" type="button" title="上移" ${i === 0 ? 'disabled' : ''} onclick="moveStep('${esc(proc.id)}','${esc(task.id)}',${i},-1)">↑</button>
            <button class="step-action step-move-down" type="button" title="下移" ${i === userSteps.length - 1 ? 'disabled' : ''} onclick="moveStep('${esc(proc.id)}','${esc(task.id)}',${i},1)">↓</button>
            <button class="step-del" type="button" onclick="removeStep('${esc(proc.id)}','${esc(task.id)}',${i})">✕</button>
          </div>
        </div>
        <textarea class="step-note auto-resize" rows="1" placeholder="条件 / 备注 / 规则"
          oninput="setStep('${esc(proc.id)}','${esc(task.id)}',${i},'note',this.value);autoResize(this)"
        >${esc(s.note || '')}</textarea>
      </div>`).join('')}</div>` : '<p class="no-refs">暂无用户操作步骤</p>'}
  </div>`;
}

function renderOrchestrationSection(proc, task) {
  const orchestrationTasks = getNodeOrchestrationTasks(task);
  return `<div class="form-section node-perspective-panel active" data-testid="orchestration-section">
    <div class="section-toolbar">
      <h4>任务级视图 <span class="section-count">${orchestrationTasks.length} 项</span></h4>
      <button class="btn btn-outline btn-sm" type="button" onclick="addOrchestrationTask('${esc(proc.id)}','${esc(task.id)}')">＋添加任务</button>
    </div>
    <p class="section-hint">面向研发视角，描述查询、校验、计算、服务编排等实现任务。</p>
    ${buildOrchestrationFlowHtml(task)}
    ${orchestrationTasks.length ? `<div class="orch-list">${orchestrationTasks.map((item, index) => `
      <div class="orch-card" data-orch-index="${index}">
        <div class="orch-row orch-row-main">
          <span class="orch-index">${index + 1}</span>
          <input class="orch-name" type="text" value="${esc(item.name || '')}" placeholder="如：校验账户状态"
            oninput="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'name',this.value)">
          <select onchange="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'type',this.value);rerenderProcessEditor()">
            ${ORCHESTRATION_TYPES.map((option) => `<option value="${option.value}" ${item.type === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}
          </select>
          <div class="step-actions orch-actions">
            <button class="step-action" type="button" title="在下方插入任务" onclick="addOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index})">+</button>
            <button class="step-action" type="button" title="上移" ${index === 0 ? 'disabled' : ''} onclick="moveOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},-1)">↑</button>
            <button class="step-action" type="button" title="下移" ${index === orchestrationTasks.length - 1 ? 'disabled' : ''} onclick="moveOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},1)">↓</button>
            <button class="step-del" type="button" onclick="removeOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index})">✕</button>
          </div>
        </div>
        <div class="orch-row orch-row-secondary">
          ${item.type === 'Query' ? `<select onchange="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'querySourceKind',this.value)">
            ${QUERY_SOURCE_KINDS.map((option) => `<option value="${option.value}" ${item.querySourceKind === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}
          </select>` : '<span class="orch-spacer"></span>'}
          <input type="text" value="${esc(item.target || '')}" placeholder="目标服务 / 字典 / 枚举"
            oninput="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'target',this.value)">
        </div>
        <textarea class="auto-resize" rows="2" placeholder="备注：输入输出、前置条件、异常处理"
          oninput="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'note',this.value);autoResize(this)"
        >${esc(item.note || '')}</textarea>
      </div>`).join('')}</div>` : '<p class="no-refs">暂无编排任务</p>'}
  </div>`;
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
    const diagMode = task && (S.ui.nodePerspective || 'user') === 'engineering' ? ' taskflow-mode' : '';
    const diagHint = task && (S.ui.nodePerspective || 'user') === 'engineering'
      ? '\u5c55\u793a\u6574\u4e2a\u6d41\u7a0b\u7684\u4efb\u52a1\u7ea7\u94fe\u8def\uff0c\u70b9\u51fb\u8282\u70b9\u53ef\u76f4\u63a5\u5207\u6362\u7f16\u8f91'
      : '\u70b9\u51fb\u8282\u70b9\u8fdb\u5165\u7f16\u8f91';
    h+=`<div class="drawer-diag${diagMode}">
      <div class="drawer-diag-bar">
        <span class="live-diagram-hint">${diagHint}</span>
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
            可退回
            <input type="checkbox" data-testid="task-returnable-toggle" ${task.repeatable?'checked':''}
              onchange="setTask('${esc(proc.id)}','${esc(task.id)}','repeatable',this.checked);rerenderProcessEditor({ focusSelector: '[data-testid=&quot;task-returnable-toggle&quot;]' })">
            <span style="font-size:11px;color:var(--text-m);font-weight:400">当前节点允许退回上一节点重新处理</span>
          </label>
        </div>
      </div>`;

      /* 步骤 */
      h+=renderNodePerspectiveSwitch();
      if ((S.ui.nodePerspective || 'user') === 'engineering') {
        h+=renderOrchestrationSection(proc, task);
      } else {
        h+=renderUserStepsSection(proc, task);
      }

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

    } else {
      /* ── 流程信息 ── */
      const prototypeFiles = getProcPrototypeFiles(proc);
      const prototypeInputId = formatPrototypeInputId(proc.id);
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
      <div class="form-section">
        <div class="section-toolbar">
          <h4>流程原型${prototypeFiles.length ? `<span class="section-count">${prototypeFiles.length}项</span>` : ''}</h4>
        </div>
        ${prototypeFiles.length ? `<div class="prototype-file-list" data-testid="proc-prototype-list">
          ${prototypeFiles.map((file) => `<div class="prototype-file-item" data-testid="proc-prototype-item">
            <div class="prototype-file-meta">
              <strong class="prototype-file-name">${esc(file.name || '')}</strong>
              <span class="prototype-file-kind">HTML 原型</span>
            </div>
            <div class="prototype-file-actions">
              <button class="btn btn-ghost-sm" type="button" data-testid="proc-prototype-open"
                onclick="openProcessPrototypeFile('${esc(proc.id)}','${esc(file.uid)}')">打开</button>
              <button class="btn btn-ghost-sm prototype-file-remove" type="button" data-testid="proc-prototype-remove"
                onclick="removeProcessPrototypeFile('${esc(proc.id)}','${esc(file.uid)}')">删除</button>
            </div>
          </div>`).join('')}
        </div>` : `<p class="no-refs" style="margin-bottom:8px">尚未上传流程原型文件</p>`}
        <div class="prototype-upload-row" data-testid="proc-prototype-upload">
          <input type="file" id="${prototypeInputId}" data-testid="proc-prototype-input" accept=".html,.htm,text/html" multiple>
          <button class="btn btn-outline btn-sm" type="button" data-testid="proc-prototype-upload-button"
            onclick="addProcessPrototypeFiles('${esc(proc.id)}','${prototypeInputId}')">上传 HTML 原型</button>
        </div>
        <p class="prototype-upload-hint">支持同一流程上传多个 HTML 原型文件，文件内容会随当前文档一起保存。</p>
      </div>
      <p style="margin-top:14px;font-size:12px;color:var(--text-m)">
        点击上方流程图中的任务节点可直接进入任务编辑
      </p>`;
      const procFocusSelector = S.ui.procEditorFocusSelector || '#proc-name-input';
      setTimeout(() => {
        const field = document.querySelector(procFocusSelector);
        if (!field) return;
        if (typeof field.focus === 'function') {
          try {
            field.focus({ preventScroll: true });
          } catch (error) {
            field.focus();
          }
        }
      },40);
      S.ui.procEditorFocusSelector = '';
    }

    h+=`</div>`; /* end drawer-body */
  } else {
    /* 无选中：提示语 */
    h+=`<div class="drawer-empty"><p>点击流程卡片打开编辑</p></div>`;
  }

  h+=`</div>`; /* end proc-drawer */

  const tabContent = document.getElementById('tab-content');
  tabContent.innerHTML = h;
  syncTaskReturnableToggle(tabContent);

  /* 渲染流程图 */
  if(proc) {
    const clickMap={};
    for(const t of getProcNodes(proc))
      clickMap[t.id]=()=>navigate('process',{procId:proc.id,taskId:t.id});
    if(task && (S.ui.nodePerspective || 'user') === 'engineering') {
      renderProcTaskFlow('proc-diagram', proc, task.id, clickMap);
    } else {
      renderProcFlow('proc-diagram', proc, clickMap);
    }
  }
}

/* 仅刷新流程图，不重建整个 DOM（输入框连续输入时用） */
function renderProcDiagramNow() {
  const proc=currentProc(); if(!proc) return;
  const clickMap={};
  for(const t of getProcNodes(proc))
    clickMap[t.id]=()=>navigate('process',{procId:proc.id,taskId:t.id});
  if(S.ui.taskId && (S.ui.nodePerspective || 'user') === 'engineering') {
    renderProcTaskFlow('proc-diagram', proc, S.ui.taskId, clickMap);
  } else {
    renderProcFlow('proc-diagram', proc, clickMap);
  }
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
