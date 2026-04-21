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


function navigate(tab, opts) {
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

function openProcessHome() {
  S.ui.tab = 'process';
  S.ui.procView = 'card';
  S.ui.taskId = null;
  if(!S.ui.procId && S.doc?.processes?.length) {
    S.ui.procId = S.doc.processes[0].id;
  }
  render();
}

function setProcView(v) {
  S.ui.procView = v;
  renderProcessTab();
}

function _defaultSbCollapse(doc) {
  const c = { lang: true }; /* 统一语言默认折叠 */
  [...new Set((doc.processes||[]).map(p => p.subDomain || '').filter(Boolean))]
    .forEach((sd) => { c[`sd-${sd}`] = true; });
  [...new Set((doc.entities||[]).map(e => e.group || '').filter(Boolean))]
    .forEach((grp) => { c[`grp-${grp}`] = true; });
  (doc.processes||[]).forEach(p => { c[`proc-${p.id}`] = true; });
  return c;
}

function render() {
  renderToolbar();
  renderTabBar();
  const manualMode = S.ui.tab === 'manual';
  document.body.classList.toggle('manual-shell', manualMode);
  if (manualMode) {
    if (typeof renderManualTab === 'function') renderManualTab();
    if (typeof bootManualTab === 'function') void bootManualTab();
    return;
  }
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
  const procKey=`proc-${p.id}`;
  const collapsed=S.ui.sbCollapse[procKey];
  const procActive=S.ui.tab==='process'&&S.ui.procId===p.id&&!S.ui.taskId;
  const taskCount=(p.tasks||[]).length;
  let h=`<div class="sb-proc-head ${procActive?'active':''}" data-process-id="${esc(p.id)}"
    onclick="navigate('process',{procId:'${p.id}',taskId:null})">
    <button class="sb-caret" onclick="event.stopPropagation();toggleCollapse('${procKey}')">${collapsed?'▶':'▾'}</button>
    <span class="sb-id editable-id" onclick="event.stopPropagation();startEditId(this,'proc','${p.id}')" title="点击编辑ID">${esc(p.id)}</span>
    <span class="sb-name" title="${esc(p.name||'未命名')}">${esc(p.name||'未命名')}</span>
    ${_renderSbCount(taskCount)}
    <span class="sb-move-btns">
      <button class="sb-move-btn sb-move-up" onclick="moveProcInSd('${esc(p.id)}',-1,event)" title="\u4e0a\u79fb" aria-label="\u4e0a\u79fb"></button>
      <button class="sb-move-btn sb-move-down" onclick="moveProcInSd('${esc(p.id)}',1,event)" title="\u4e0b\u79fb" aria-label="\u4e0b\u79fb"></button>
    </span>
  </div>`;
  if(!collapsed) {
    for(const t of (p.tasks||[])) {
      const tActive=S.ui.tab==='process'&&S.ui.taskId===t.id;
      h+=`<div class="sb-task-item ${tActive?'active':''}"
        onclick="navigate('process',{procId:'${p.id}',taskId:'${t.id}'})">
        <span class="sb-id editable-id" onclick="event.stopPropagation();startEditId(this,'task','${p.id}','${t.id}')" title="点击编辑ID">${esc(t.id)}</span>
        <span class="sb-name" title="${esc(t.name||'未命名')}">${esc(t.name||'未命名')}</span>
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
  const subDomains=[...new Set(procs.map(p=>p.subDomain||''))];
  const groups=[...new Set(entities.map(e=>e.group||''))];
  const processBucketCount = subDomains.filter(Boolean).length + (subDomains.includes('') ? 1 : 0);
  const entityBucketCount = groups.filter(Boolean).length + (groups.includes('') ? 1 : 0);
  const processCount = procs.length;
  const stepCount = procs.reduce((sum, proc) => {
    return sum + (proc.tasks || []).reduce((taskSum, task) => taskSum + ((task.steps || []).length), 0);
  }, 0);
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
          { label: '\u5b50\u57df', value: processBucketCount },
          { label: '\u6d41\u7a0b', value: processCount },
          { label: '\u6b65\u9aa4', value: stepCount },
        ])}
      </div>
      <button class="sb-add-btn" onclick="addProcess()" title="\u65b0\u5efa\u6d41\u7a0b">+</button>
    </div>`;

  if(!procs.length){
    h+=`<div class="sb-empty">暂无流程</div>`;
  } else {
    for(const sd of subDomains) {
      const sdProcs=procs.filter(p=>(p.subDomain||'')===sd);
      if(sd) {
        const sdKey=`sd-${sd}`;
        const collapsed=S.ui.sbCollapse[sdKey];
        h+=`<div class="sb-grp-head" data-subdomain="${esc(sd)}" onclick="toggleCollapse('${sdKey}')">
          <button class="sb-caret">${collapsed?'▶':'▾'}</button>
          <span class="sb-name" title="${esc(sd)}">${esc(sd)}</span>
          ${_renderSbCount(sdProcs.length)}
          <button class="sb-add-btn" onclick="event.stopPropagation();addProcess('${esc(sd)}')" title="在此子域新建流程">＋</button>
          <span class="sb-move-btns">
            <button class="sb-move-btn sb-move-up" onclick="moveSdGroup('${esc(sd)}',-1,event)" title="\u4e0a\u79fb" aria-label="\u4e0a\u79fb"></button>
            <button class="sb-move-btn sb-move-down" onclick="moveSdGroup('${esc(sd)}',1,event)" title="\u4e0b\u79fb" aria-label="\u4e0b\u79fb"></button>
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
          <button class="sb-caret">${collapsed?'▶':'▾'}</button>
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
  document.getElementById('tab-bar').innerHTML=tabs.map(t=>{
    const onclick = t.id === 'process' ? 'openProcessHome()' : `navigate('${t.id}',{})`;
    return `<button class="tab-btn ${S.ui.tab===t.id?'active':''}" data-testid="tab-${t.id}"
      onclick="${onclick}">${t.label}</button>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   CARD MAP — 流程地图拖拽
═══════════════════════════════════════════════════════════ */

function startDrawerResize(e) {
  e.preventDefault(); e.stopPropagation();
  const drawer = e.currentTarget.closest('.proc-drawer, .entity-drawer');
  if(!drawer) return;
  const drawerKind = drawer.classList.contains('proc-drawer') ? 'process' : 'entity';
  const startX = e.clientX;
  const startW = drawer.offsetWidth;
  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';
  function onMove(ev) {
    const newW = Math.max(300, Math.min(window.innerWidth * 0.75, startW + startX - ev.clientX));
    drawer.style.width = newW + 'px';
    setDrawerWidth(drawerKind, newW);
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
