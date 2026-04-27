'use strict';

/* ═══════════════════════════════════════════════════════════
   ZOOM
   原理：读取 SVG viewBox 得到自然尺寸，通过修改 width/height 属性缩放。
   Mermaid 会给 SVG 加 style="max-width:...;height:auto"，必须先清除。
═══════════════════════════════════════════════════════════ */
const ZOOM = {};


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
  /* 自定义 HTML 流程图（pf-wrap / ptf-wrap），优先整体缩放容器，避免命中内部回退线 SVG */
  const wrap = el.querySelector('.pf-wrap, .ptf-wrap, .business-flow-wrap');
  if(wrap) {
    wrap.style.zoom = String(s);
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
}

function zoomBy(id, delta) {
  ZOOM[id] = Math.max(0.3, Math.min(4, (ZOOM[id]||1) + delta));
  applyZoom(id);
}
function resetZoom(id) { ZOOM[id] = 1; applyZoom(id); }

function initZoom(id) {
  const el  = document.getElementById(id);
  if(!el) return;
  const wrap = el.querySelector('.pf-wrap, .ptf-wrap, .business-flow-wrap');
  /* 每次渲染后刷新 SVG 自然尺寸（SVG DOM 已替换；跳过 ef-canvas overlay SVG） */
  const svg = el.querySelector('svg');
  if(svg && !wrap && !el.querySelector('.ef-canvas')) _captureSvgSize(svg);
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

function navigate(tab, opts, navOptions = {}) {
  queueUiNavigationHistoryFor((next) => {
    next.tab = tab;
    if (opts) {
      if ('procId' in opts) next.procId = opts.procId;
      if ('taskId' in opts) next.taskId = opts.taskId;
      if ('entityId' in opts) next.entityId = opts.entityId;
    }
    if (tab === 'process' && opts && ('procId' in opts || 'taskId' in opts)) {
      next.procView = 'list';
    }
    return next;
  }, navOptions);
  S.ui.tab = tab;
  if(opts) {
    if('procId'   in opts) S.ui.procId   = opts.procId;
    if('taskId'   in opts) S.ui.taskId   = opts.taskId;
    if('entityId' in opts) S.ui.entityId = opts.entityId;
  }
  if(tab === 'process' && opts && ('procId' in opts || 'taskId' in opts)) {
    S.ui.procView = 'list';
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
  const domainScroll = document.querySelector('.domain-scroll');
  renderDomainTab({ scrollTop: domainScroll ? domainScroll.scrollTop : 0 });
}

function toggleSidebar() {
  S.ui.sidebarCollapsed = !S.ui.sidebarCollapsed;
  renderSidebar();
}

function startSidebarResize(e) {
  if(S.ui.sidebarCollapsed) return;
  e.preventDefault();
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;
  const startX = e.clientX;
  const startW = sidebar.offsetWidth;
  sidebar.classList.add('sb-resizing');

  function onMove(ev) {
    const nextWidth = Math.max(220, Math.min(460, startW + (ev.clientX - startX)));
    sidebar.style.width = `${nextWidth}px`;
    sidebar.style.minWidth = `${nextWidth}px`;
    setSidebarWidth(nextWidth);
  }

  function onUp() {
    sidebar.classList.remove('sb-resizing');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function openProcessHome(navOptions = {}) {
  queueUiNavigationHistoryFor((next) => {
    next.tab = 'process';
    next.procView = 'stage';
    next.stageViewMode = 'panorama';
    next.taskId = null;
    if (!next.procId && S.doc?.processes?.length) {
      next.procId = S.doc.processes[0].id;
    }
    return next;
  }, navOptions);
  S.ui.tab = 'process';
  S.ui.procView = 'stage';
  S.ui.stageViewMode = 'panorama';
  S.ui.taskId = null;
  if(!S.ui.procId && S.doc?.processes?.length) {
    S.ui.procId = S.doc.processes[0].id;
  }
  render();
}

function setProcView(v, navOptions = {}) {
  if (v === 'card' && typeof openProcessFlowView === 'function') {
    openProcessFlowView(navOptions);
    return;
  }
  queueUiNavigationHistoryFor({ procView: v }, navOptions);
  S.ui.procView = v;
  render();
}

function _defaultSbCollapse(doc) {
  const processes = doc.processes || [];
  const c = { lang: true };
  [...new Set(processes.map(p => p.subDomain || '').filter(Boolean))]
    .forEach((sd) => { c[`sd-${sd}`] = true; });
  [...new Set(processes.map((p) => `${p.subDomain || ''}::${p.flowGroup || ''}`))]
    .forEach((key) => { c[`fg-${key}`] = true; });
  getStageItems(doc).forEach((stageItem) => { c[`stage-tree-${stageItem.id}`] = true; });
  [...new Set((doc.entities||[]).map(e => e.group || '').filter(Boolean))]
    .forEach((grp) => { c[`grp-${grp}`] = true; });
  processes.forEach(p => { c[`proc-${p.id}`] = true; });
  return c;
}


function render() {
  renderToolbar();
  const manualMode = S.ui.tab === 'manual';
  document.body.classList.toggle('manual-shell', manualMode);
  if (manualMode) {
    document.getElementById('tab-bar').innerHTML = '';
    if (typeof renderManualTab === 'function') renderManualTab();
    if (typeof bootManualTab === 'function') void bootManualTab();
    return;
  }
  renderTabBar();
  if(!S.doc){renderNoDoc();return;}
  renderSidebar();
  const t=S.ui.tab;
  if     (t==='domain') renderDomainTab();
  else if(t==='process') renderProcessTab();
  else if(t==='data')   renderDataTab();
  else if(t==='preview') renderPreviewTab();
  /* 渲染完成后初始化所有 auto-resize textarea 高度 */
  setTimeout(initAutoResize, 0);
}

function renderToolbar() {
  const name = getCurrentDocumentLabel();
  document.getElementById('file-name').textContent = name;
  document.getElementById('file-name').title = getCurrentDocumentTitle();
  document.getElementById('modified-badge')?.classList.toggle('hidden', !S.modified);
  document.getElementById('save-alert')?.classList.toggle('hidden', !S.modified);
  document.getElementById('toolbar-manual-button')?.classList.toggle('active', S.ui.tab === 'manual');
  if (typeof refreshSaveDialogText === 'function') {
    refreshSaveDialogText();
  }
}

function renderNoDoc() {
  document.getElementById('sidebar-content').innerHTML =
    `<div class="sb-empty" style="padding:20px 12px;line-height:1.8">新建或打开文档<br>开始建模</div>`;
  document.getElementById('tab-bar').innerHTML='';
  document.getElementById('tab-content').innerHTML=`
    <div class="empty-state">
      <h2>BLM（Business Language Modeling）业务语言建模</h2>
      <p>结构化记录业务理解，生成可读文档</p>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary" onclick="App.cmdNew()">新建文档</button>
        <button class="btn btn-outline" onclick="App.cmdOpen()">打开文档</button>
      </div>
    </div>`;
}

/* ─── 辅助：渲染单个流程条目及其任务 ─── */
function _renderSbCount(count) {
  return `<span class="sb-count" data-count="${count}">${count}</span>`;
}

function _renderSbMetrics(metrics) {
  return `<div class="sb-metrics">${metrics.map((metric) => `
    <span class="sb-metric" title="${esc(metric.label)} ${metric.value}">
      <span class="sb-metric-label">${esc(metric.label)}</span>
      <span class="sb-metric-gap"> </span>
      <span class="sb-metric-value">${metric.value}</span>
    </span>`).join('')}</div>`;
}

function _renderSbProc(p) {
  const procActive=S.ui.tab==='process'&&S.ui.procId===p.id&&!S.ui.taskId;
  const taskCount=getProcNodes(p).length;
  return `<div class="sb-proc-head ${procActive?'active':''}" data-process-id="${esc(p.id)}"
    onclick="navigate('process',{procId:'${p.id}',taskId:null})">
    <span class="sb-id editable-id" onclick="event.stopPropagation();startEditId(this,'proc','${p.id}')" title="点击编辑ID">${esc(p.id)}</span>
    <span class="sb-name" title="${esc(p.name||'未命名')}">${esc(p.name||'未命名')}</span>
    ${_renderSbCount(taskCount)}
    <span class="sb-move-btns">
      <button class="sb-move-btn sb-move-up" onclick="moveProcInSd('${esc(p.id)}',-1,event)" title="\u4e0a\u79fb" aria-label="\u4e0a\u79fb"></button>
      <button class="sb-move-btn sb-move-down" onclick="moveProcInSd('${esc(p.id)}',1,event)" title="\u4e0b\u79fb" aria-label="\u4e0b\u79fb"></button>
    </span>
  </div>`;
}

function _renderSbStage(stageItem, processes, collapseKey) {
  const isActive = S.ui.tab === 'process' && S.ui.procView === 'stage' && S.ui.stageId === stageItem.id;
  const isCollapsed = !!S.ui.sbCollapse[collapseKey];
  return `<div class="sb-subgrp-head sb-stage-head ${isActive ? 'active' : ''}" data-stage-id="${esc(stageItem.id)}"
    onclick="navigateStageView('${esc(stageItem.id)}','detail')">
    <button type="button" class="sb-caret ${isCollapsed ? 'is-collapsed' : 'is-expanded'}"
      onclick="event.stopPropagation();toggleCollapse('${esc(collapseKey)}')"><span class="sb-caret-icon">▶</span></button>
    <span class="sb-subgrp-badge">业务阶段</span>
    <span class="sb-name" title="${esc(stageItem.name)}">${esc(stageItem.name)}</span>
    ${_renderSbCount(processes.length)}
  </div>`;
}

function _renderSbFlowGroup(flowGroup, processes, collapseKey) {
  const isCollapsed = !!S.ui.sbCollapse[collapseKey];
  const label = flowGroup || '未分组流程';
  return `<div class="sb-subgrp-head sb-flowgroup-head" data-flow-group="${esc(label)}"
    onclick="toggleCollapse('${esc(collapseKey)}')">
    <button type="button" class="sb-caret ${isCollapsed ? 'is-collapsed' : 'is-expanded'}"
      onclick="event.stopPropagation();toggleCollapse('${esc(collapseKey)}')"><span class="sb-caret-icon">▶</span></button>
    <span class="sb-subgrp-badge">流程组</span>
    <span class="sb-name" title="${esc(label)}">${esc(label)}</span>
    ${_renderSbCount(processes.length)}
  </div>`;
}

function isStageSidebarBrowseMode() {
  return S.ui.tab === 'process' && S.ui.procView === 'stage';
}

function getProcessSidebarBrowseMode() {
  const explicitMode = String(S.ui.processSidebarMode || 'domain');
  return explicitMode === 'stage' ? 'stage' : 'domain';
}

function setProcessSidebarBrowseMode(mode) {
  const nextMode = ['stage', 'domain'].includes(String(mode || ''))
    ? String(mode)
    : 'domain';
  if (S.ui.processSidebarMode === nextMode) return;
  S.ui.processSidebarMode = nextMode;
  renderSidebar();
}

/* ═══════════════════════════════════════════════════════════
   RENDER — Sidebar (collapsible tree)
═══════════════════════════════════════════════════════════ */
function renderSidebar() {
  const procs    = S.doc.processes||[];
  const entities = S.doc.entities||[];
  const collapsed = S.ui.sidebarCollapsed;
  const stageItems = getStageItems(S.doc);
  const subDomains=[...new Set(procs.map(p=>p.subDomain||''))];
  const groups=[...new Set(entities.map(e=>e.group||''))];
  const processSidebarMode = getProcessSidebarBrowseMode();
  const stageSidebarMode = processSidebarMode === 'stage';
  const processBucketCount = subDomains.filter(Boolean).length + (subDomains.includes('') ? 1 : 0);
  const stageCount = getStages(S.doc).length;
  const entityBucketCount = groups.filter(Boolean).length + (groups.includes('') ? 1 : 0);
  const processCount = procs.length;
  const nodeCount = procs.reduce((sum, proc) => sum + getProcNodes(proc).length, 0);
  const orchestrationTaskCount = procs.reduce(
    (sum, proc) => sum + getProcNodes(proc).reduce(
      (nodeSum, node) => nodeSum + getNodeOrchestrationTasks(node).length,
      0,
    ),
    0,
  );
  const entityCount = entities.length;
  const fieldCount = entities.reduce((sum, entity) => sum + ((entity.fields || []).length), 0);

  /* 控制侧边栏宽度 & 外部按钮文字 */
  const sb = document.getElementById('sidebar');
  if(sb) {
    sb.classList.toggle('sb-collapsed', collapsed);
    if(collapsed) {
      sb.style.width = '';
      sb.style.minWidth = '';
    } else {
      const sidebarW = getSidebarWidth();
      sb.style.width = `${sidebarW}px`;
      sb.style.minWidth = `${sidebarW}px`;
    }
  }
  const toggleBtn = document.getElementById('sb-toggle-btn');
  if(toggleBtn) toggleBtn.textContent = collapsed ? '展开' : '折叠';

  if(collapsed) {
    document.getElementById('sidebar-content').innerHTML='';
    return;
  }

  let h='';

  /* ── 流程区（按业务子域分组） ── */
  h+=`<div class="sb-section">
    <div class="sb-header" data-section="process">
      <div class="sb-header-main">
        <span class="sb-header-title">\u6d41\u7a0b</span>
        ${_renderSbMetrics([
          { label: '\u9636\u6bb5', value: stageCount },
          { label: '\u6d41\u7a0b', value: processCount },
          { label: '\u8282\u70b9', value: nodeCount },
          { label: '\u4efb\u52a1', value: orchestrationTaskCount },
        ])}
        <div class="sb-view-toggle-group" data-testid="sidebar-process-mode-switch">
          <button class="sb-view-toggle ${processSidebarMode === 'domain' ? 'active' : ''}" type="button"
            data-testid="sidebar-browse-domain" onclick="setProcessSidebarBrowseMode('domain')">子域视角</button>
          <button class="sb-view-toggle ${processSidebarMode === 'stage' ? 'active' : ''}" type="button"
            data-testid="sidebar-browse-stage" onclick="setProcessSidebarBrowseMode('stage')">阶段视角</button>
        </div>
      </div>
      <button class="sb-add-btn" onclick="addProcess()" title="\u65b0\u5efa\u6d41\u7a0b">+</button>
    </div>
    <div class="sb-process-browse" data-testid="${stageSidebarMode ? 'sidebar-stage-browse' : 'sidebar-domain-browse'}">`;

  if(stageSidebarMode) {
    for (const stageItem of stageItems) {
      const stageProcesses = getStageProcesses(stageItem.id, S.doc);
      const collapseKey = `stage-tree-${stageItem.id}`;
      h += _renderSbStage(stageItem, stageProcesses, collapseKey);
      if (S.ui.sbCollapse[collapseKey]) continue;
      if (!stageProcesses.length) {
        h += `<div class="sb-empty sb-stage-empty">暂无流程</div>`;
        continue;
      }
      for (const p of stageProcesses) {
        h += _renderSbProc(p);
      }
    }
  } else if(!procs.length){
    h+=`<div class="sb-empty">\u6682\u65e0\u6d41\u7a0b</div>`;
  } else {
    for(const sd of subDomains) {
      const sdProcs=procs.filter(p=>(p.subDomain||'')===sd);
      const sdLabel = sd || '\u672a\u5f52\u7c7b\u4e1a\u52a1\u5b50\u57df';
      const sdKey=`sd-${sd}`;
      const sdCollapsed=S.ui.sbCollapse[sdKey];
      const flowGroups = [...new Set(sdProcs.map((proc) => proc.flowGroup || ''))];
      h+=`<div class="sb-grp-head" data-subdomain="${esc(sdLabel)}" onclick="toggleCollapse('${sdKey}')">
        <button type="button" class="sb-caret ${sdCollapsed ? 'is-collapsed' : 'is-expanded'}"
          onclick="event.stopPropagation();toggleCollapse('${sdKey}')"><span class="sb-caret-icon">▶</span></button>
        <span class="sb-grp-badge">业务子域</span>
        <span class="sb-name" title="${esc(sdLabel)}">${esc(sdLabel)}</span>
        ${_renderSbCount(sdProcs.length)}
        <button class="sb-add-btn" onclick="event.stopPropagation();addProcess('${esc(sd)}')" title="\u5728\u6b64\u4e1a\u52a1\u5b50\u57df\u65b0\u5efa\u6d41\u7a0b">+</button>
        ${sd ? `<span class="sb-move-btns">
          <button class="sb-move-btn sb-move-up" onclick="moveSdGroup('${esc(sd)}',-1,event)" title="\u4e0a\u79fb" aria-label="\u4e0a\u79fb"></button>
          <button class="sb-move-btn sb-move-down" onclick="moveSdGroup('${esc(sd)}',1,event)" title="\u4e0b\u79fb" aria-label="\u4e0b\u79fb"></button>
        </span>` : ''}
      </div>`;
      if(sdCollapsed) continue;

      if (!flowGroups.length) {
        h += `<div class="sb-empty">\u6682\u65e0\u6d41\u7a0b\u7ec4</div>`;
      }

      for (const flowGroup of flowGroups) {
        const fgProcs = sdProcs.filter((proc) => String(proc.flowGroup || '') === String(flowGroup || ''));
        const fgKey = `fg-${sd}::${flowGroup}`;
        h += _renderSbFlowGroup(flowGroup, fgProcs, fgKey);
        if (S.ui.sbCollapse[fgKey]) continue;
        if (!fgProcs.length) {
          h += `<div class="sb-empty sb-stage-empty">暂无流程</div>`;
          continue;
        }
        for(const p of fgProcs) {
          h+=_renderSbProc(p);
        }
      }
    }
  }
  h+=`</div></div>`;

  /* ── 实体区（按主题域分组） ── */
  h+=`<div class="sb-section">
    <div class="sb-header" data-section="entity">
      <div class="sb-header-main">
        <span class="sb-header-title">\u5b9e\u4f53</span>
        ${_renderSbMetrics([
          { label: '\u4e3b\u9898\u57df', value: entityBucketCount },
          { label: '\u5b9e\u4f53', value: entityCount },
          { label: '\u5b57\u6bb5', value: fieldCount },
        ])}
      </div>
      <button class="sb-add-btn" onclick="addEntity()" title="\u65b0\u5efa\u5b9e\u4f53">+</button>
    </div>`;

  if(!entities.length){
    h+=`<div class="sb-empty">暂无实体</div>`;
  } else {
    for(const grp of groups) {
      const grpEntities=entities.filter(e=>(e.group||'')===grp);
      if(grp) {
        const grpKey=`grp-${grp}`;
        const collapsed=S.ui.sbCollapse[grpKey];
        h+=`<div class="sb-grp-head" data-group="${esc(grp)}" onclick="toggleCollapse('${grpKey}')">
          <button type="button" class="sb-caret ${collapsed ? 'is-collapsed' : 'is-expanded'}"><span class="sb-caret-icon">▶</span></button>
          <span class="sb-grp-badge">主题域</span>
          <span class="sb-name" title="${esc(grp)}">${esc(grp)}</span>
          ${_renderSbCount(grpEntities.length)}
          <button class="sb-add-btn" onclick="event.stopPropagation();addEntity('${esc(grp)}')" title="在此主题域新建实体">＋</button>
          <span class="sb-move-btns">
            <button class="sb-move-btn sb-move-up" onclick="moveGrpGroup('${esc(grp)}',-1,event)" title="\u4e0a\u79fb" aria-label="\u4e0a\u79fb"></button>
            <button class="sb-move-btn sb-move-down" onclick="moveGrpGroup('${esc(grp)}',1,event)" title="\u4e0b\u79fb" aria-label="\u4e0b\u79fb"></button>
          </span>
        </div>`;
        if(!collapsed) {
          for(const e of grpEntities) {
            const active=S.ui.tab==='data'&&S.ui.entityId===e.id;
            h+=`<div class="sb-entity-item ${active?'active':''}" data-entity-id="${esc(e.id)}"
              onclick="navigate('data',{entityId:'${e.id}'})">
              <span class="sb-id editable-id" onclick="event.stopPropagation();startEditId(this,'entity','${e.id}')" title="点击编辑ID">${esc(e.id)}</span>
              <span class="sb-name" title="${esc(e.name||'未命名')}">${esc(e.name||'未命名')}</span>
              <span class="sb-move-btns">
                <button class="sb-move-btn sb-move-up" onclick="moveEntityInGrp('${esc(e.id)}',-1,event)" title="\u4e0a\u79fb" aria-label="\u4e0a\u79fb"></button>
                <button class="sb-move-btn sb-move-down" onclick="moveEntityInGrp('${esc(e.id)}',1,event)" title="\u4e0b\u79fb" aria-label="\u4e0b\u79fb"></button>
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
            <span class="sb-name" title="${esc(e.name||'未命名')}">${esc(e.name||'未命名')}</span>
            <span class="sb-move-btns">
              <button class="sb-move-btn sb-move-up" onclick="moveEntityInGrp('${esc(e.id)}',-1,event)" title="\u4e0a\u79fb" aria-label="\u4e0a\u79fb"></button>
              <button class="sb-move-btn sb-move-down" onclick="moveEntityInGrp('${esc(e.id)}',1,event)" title="\u4e0b\u79fb" aria-label="\u4e0b\u79fb"></button>
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
  const canGoBack = canGoBackNavigation();
  const backTitle = esc(getBackNavigationTitle());
  const tabHtml = tabs.map(t=>{
    const onclick = t.id === 'process' ? 'openProcessHome()' : `navigate('${t.id}',{})`;
    return `<button class="tab-btn ${S.ui.tab===t.id?'active':''}" data-testid="tab-${t.id}"
      onclick="${onclick}">${t.label}</button>`;
  }).join('');
  document.getElementById('tab-bar').innerHTML = `
    <div class="tab-btn-group">${tabHtml}</div>
    <button class="tab-btn tab-back-btn" data-testid="nav-back-button"
      onclick="goBackNavigation()" title="${backTitle}" ${canGoBack ? '' : 'disabled'}>
      ← 返回
    </button>`;
}

/* ═══════════════════════════════════════════════════════════
   CARD MAP — 流程地图拖拽
═══════════════════════════════════════════════════════════ */

function startDrawerResize(e) {
  e.preventDefault(); e.stopPropagation();
  const drawer = e.currentTarget.closest('.proc-drawer, .entity-drawer, .state-editor-drawer, .stage-drawer');
  if(!drawer) return;
  const drawerKind = drawer.classList.contains('entity-drawer') || drawer.classList.contains('state-editor-drawer')
    ? 'entity'
    : 'process';
  const startX = e.clientX;
  const startW = drawer.offsetWidth;
  const minWidth = drawerKind === 'entity' ? 420 : 300;
  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';
  function onMove(ev) {
    const newW = Math.max(minWidth, Math.min(window.innerWidth * 0.75, startW + startX - ev.clientX));
    drawer.style.width = newW + 'px';
    setDrawerWidth(drawerKind, newW);
    if (drawerKind === 'entity' && S.ui.tab === 'data' && (S.ui.dataView || 'relation') === 'relation') {
      const wrap = document.getElementById('diagram-wrap');
      if (wrap) wrap.style.marginRight = newW + 'px';
    } else if (drawer.classList.contains('state-editor-drawer')) {
      const mainShell = document.querySelector('.entity-state-main-shell');
      if (mainShell) mainShell.style.marginRight = newW + 'px';
    } else if (drawer.classList.contains('stage-drawer')) {
      const mainShell = document.querySelector('.stage-main-shell');
      if (mainShell) mainShell.style.marginRight = newW + 'px';
    }
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

function startProcessDiagramResize(e) {
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget;
  const host = handle?.closest('.process-flow-card') || handle?.closest('.proc-drawer');
  const diagram = host?.querySelector('.drawer-diag.taskflow-mode') || host?.querySelector('.drawer-diag');
  if (!host || !diagram) return;

  const head = host.querySelector('.process-flow-head') || host.querySelector('.drawer-head');
  const startY = e.clientY;
  const startH = diagram.offsetHeight;
  const bodyMinHeight = host.classList.contains('process-flow-card') ? 180 : 240;
  handle.classList.add('dragging');
  document.body.style.cursor = 'ns-resize';
  document.body.style.userSelect = 'none';

  function clampHeight(rawHeight) {
    const headHeight = head?.offsetHeight || 0;
    const handleHeight = handle.offsetHeight || 0;
    const maxByViewport = Math.floor(window.innerHeight * 0.72);
    const maxByDrawer = host.classList.contains('process-flow-card')
      ? maxByViewport
      : host.clientHeight - headHeight - handleHeight - bodyMinHeight;
    const maxHeight = Math.max(160, Math.min(maxByDrawer, maxByViewport));
    return Math.max(140, Math.min(maxHeight, rawHeight));
  }

  function onMove(ev) {
    const newH = clampHeight(startH + ev.clientY - startY);
    diagram.style.height = `${newH}px`;
    setProcessDiagramHeight(newH);
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
