'use strict';

function renderBlmMd(md) {
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

function getRoleDesc(role) {
  return typeof role === 'object' && role ? String(role.desc || '').trim() : '';
}

function getRoleGroup(role) {
  return typeof role === 'object' && role ? String(role.group || '').trim() : '';
}

function getRoleSubDomains(role) {
  return typeof role === 'object' && role
    ? (role.subDomains || []).map((item) => String(item || '').trim()).filter(Boolean).join('、')
    : '';
}


/* ═══════════════════════════════════════════════════════════
   RENDER — Preview Tab
═══════════════════════════════════════════════════════════ */
function previewAnchorId(prefix, value) {
  return `preview-${prefix}-${String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section'}`;
}

function buildPreviewOutlineItems(doc) {
  const items = [{ id: 'preview-top', label: doc?.meta?.title || doc?.meta?.domain || '文档概览', depth: 0 }];
  if ((doc?.roles || []).length) items.push({ id: 'preview-roles', label: '角色', depth: 0 });
  if ((doc?.language || []).length) items.push({ id: 'preview-language', label: '统一语言/术语表', depth: 0 });
  if ((doc?.processes || []).length) {
    items.push({ id: 'preview-processes', label: '流程建模', depth: 0 });
    (doc.processes || []).forEach((proc) => {
      items.push({
        id: previewAnchorId('proc', proc.id || proc.name || 'process'),
        label: `${proc.id || ''} ${proc.name || ''}`.trim() || '未命名流程',
        depth: 1,
      });
    });
  }
  if ((doc?.entities || []).length) {
    items.push({ id: 'preview-entities', label: '数据建模', depth: 0 });
    (doc.entities || []).forEach((entity) => {
      items.push({
        id: previewAnchorId('entity', entity.id || entity.name || 'entity'),
        label: `${entity.id || ''} ${entity.name || ''}`.trim() || '未命名实体',
        depth: 1,
      });
    });
  }
  return items;
}

function renderPreviewOutline(doc) {
  const container = document.getElementById('preview-outline');
  if (!container) return;
  const items = buildPreviewOutlineItems(doc);
  container.innerHTML = `
    <div class="preview-outline-title">大纲视图</div>
    <div class="preview-outline-list">
      ${items.map((item) => `
        <button class="preview-outline-link depth-${item.depth}" onclick="previewJumpTo('${esc(item.id)}')">
          ${esc(item.label)}
        </button>`).join('')}
    </div>`;
}

function previewJumpTo(anchorId) {
  const target = document.getElementById(anchorId);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPreviewTab() {
  document.getElementById('tab-content').innerHTML = `
    <div class="preview-wrap">
      <div class="preview-topbar">
        <button class="btn btn-outline btn-sm" data-testid="preview-export-bundle" onclick="App.cmdExport()">↓ 导出</button>
        <button id="preview-raw-toggle" class="btn btn-ghost-sm" style="margin-left:auto" onclick="togglePreviewRaw()">显示原文 MD</button>
      </div>
      <div id="preview-body" class="preview-body">
        <aside id="preview-outline" class="preview-outline"></aside>
        <div id="preview-rendered" class="preview-rendered pv-content"></div>
      </div>
      <pre id="preview-raw" class="preview-md hidden"></pre>
    </div>`;

  if(!S.doc) return;
  document.getElementById('preview-raw').textContent = buildMdFromDoc(S.doc);
  renderPreviewOutline(S.doc);
  buildHtmlPreview();
}

function buildPreviewMetaLine(meta) {
  const parts = [];
  if (meta?.domain) parts.push(`<strong>业务域</strong>: ${esc(meta.domain)}`);
  if (meta?.author) parts.push(`<strong>作者</strong>: ${esc(meta.author)}`);
  if (meta?.date) parts.push(`<strong>日期</strong>: ${esc(meta.date)}`);
  return parts.length ? `<p class="pv-meta">${parts.join(' | ')}</p>` : '';
}

function renderPreviewRolesHtml(roles) {
  if (!roles.length) return '';
  return `<h2 id="preview-roles">角色</h2>
    <table><thead><tr><th>角色</th><th>分组</th><th>说明</th><th>所属业务子域</th></tr></thead><tbody>
      ${roles.map((role) => `<tr>
        <td>${esc(getRoleName(role))}</td>
        <td>${esc(getRoleGroup(role))}</td>
        <td>${esc(getRoleDesc(role))}</td>
        <td>${esc(getRoleSubDomains(role))}</td>
      </tr>`).join('')}
    </tbody></table>`;
}

function renderPreviewLanguageHtml(languageItems) {
  if (!languageItems.length) return '';
  return `<h2 id="preview-language">统一语言/术语表</h2>
    <table><thead><tr><th>术语</th><th>定义</th></tr></thead><tbody>
      ${languageItems.map((item) => `<tr><td>${esc(item.term||'')}</td><td>${esc(item.definition||'')}</td></tr>`).join('')}
    </tbody></table>`;
}

function formatPrototypeSummary(prototypeFiles) {
  return prototypeFiles
    .map((file) => {
      const versions = Array.isArray(file?.versions) ? file.versions : [];
      const currentVersion = versions.find((version) => version.uid === file?.versionUid) || versions[versions.length - 1] || null;
      const versionLabel = versions.length ? `（当前 v${currentVersion?.number || 1}，共${versions.length}版）` : '';
      const name = String(file?.name || '').trim();
      return name ? `${name}${versionLabel}` : '';
    })
    .filter(Boolean)
    .join('、');
}

function renderPreviewProcessesHtml(processes, entityMap, stepLabels, orchestrationLabels, querySourceLabels) {
  if (!processes.length) return '';
  return `<h2 id="preview-processes">流程建模</h2>
    ${processes.map((proc) => {
      const nodes = getProcNodes(proc);
      const prototypeFiles = getProcPrototypeFiles(proc);
      return `<h3 id="${previewAnchorId('proc', proc.id || proc.name || 'process')}">${esc(proc.id)}: ${esc(proc.name||'')}</h3>
        <p class="pv-note">
          <strong>业务子域</strong>: ${esc(proc.subDomain || '—')}
          ${proc.flowGroup ? ` | <strong>流程组</strong>: ${esc(proc.flowGroup)}` : ''}
        </p>
        ${proc.trigger || proc.outcome ? `<p class="pv-note"><strong>触发</strong>: ${esc(proc.trigger||'—')} → <strong>预期结果</strong>: ${esc(proc.outcome||'—')}</p>` : ''}
        ${prototypeFiles.length ? `<p class="pv-note"><strong>流程原型</strong>: ${esc(formatPrototypeSummary(prototypeFiles))}</p>` : ''}
        <div id="pv-proc-${proc.id}" class="pv-diag"></div>
        ${nodes.length ? `<div class="pv-tasks">
          ${nodes.map((node) => {
            const roleName = getTaskRoleName(node);
            const entityOps = node.entity_ops || [];
            const userSteps = getNodeUserSteps(node);
            const orchestrationTasks = getNodeOrchestrationTasks(node);
            return `<div class="pv-task-detail">
              <h4>${esc(node.id)}: ${esc(node.name||'')} <span class="pv-role">(${esc(roleName)})</span></h4>
              ${node.repeatable ? '<p class="pv-note">可退回节点</p>' : ''}
              ${userSteps.length ? `<table><thead><tr><th>#</th><th>用户操作步骤</th><th>类型</th><th>条件/备注</th></tr></thead><tbody>
                ${userSteps.map((step, index) => `<tr><td>${index + 1}</td><td>${esc(step.name||'')}</td><td>${esc(stepLabels[step.type]||step.type||'')}</td><td>${esc(step.note||'')}</td></tr>`).join('')}
              </tbody></table>` : ''}
              ${orchestrationTasks.length ? `<table><thead><tr><th>#</th><th>编排任务</th><th>类型</th><th>查询来源</th><th>目标</th><th>备注</th></tr></thead><tbody>
                ${orchestrationTasks.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.name||'')}</td><td>${esc(orchestrationLabels[item.type]||item.type||'')}</td><td>${esc(querySourceLabels[item.querySourceKind]||item.querySourceKind||'—')}</td><td>${esc(item.target||'')}</td><td>${esc(item.note||'')}</td></tr>`).join('')}
              </tbody></table>` : ''}
              ${entityOps.length ? `<p class="pv-note"><strong>涉及实体</strong>: ${entityOps.map((entityOp) => {
                const entityName = (entityMap[entityOp.entity_id]?.name) || entityOp.entity_id;
                return `${esc(entityName)}（${esc((entityOp.ops||[]).join(','))}）`;
              }).join(', ')}</p>` : ''}
              ${node.rules_note?.trim() ? `<p class="pv-note"><strong>业务规则</strong>: ${esc(node.rules_note)}</p>` : ''}
            </div>`;
          }).join('')}
        </div>` : ''}`;
    }).join('')}`;
}

function renderPreviewEntitiesHtml(entities, fieldLabels) {
  if (!entities.length) return '';
  return `<h2 id="preview-entities">数据建模</h2>
    <div id="pv-entity-diag" class="pv-diag pv-entity-diag"></div>
    ${entities.map((entity) => `<div class="pv-entity-section">
      <h3 id="${previewAnchorId('entity', entity.id || entity.name || 'entity')}">实体: ${esc(entity.name||entity.id)}</h3>
      ${entity.note ? `<p class="pv-note">${esc(entity.note)}</p>` : ''}
      ${entity.fields?.length ? `<table><thead><tr><th>字段</th><th>类型</th><th>主键</th><th>状态字段</th><th>字段规则</th></tr></thead><tbody>
        ${entity.fields.map((field) => `<tr>
          <td>${esc(field.name||'')}</td>
          <td>${esc(fieldLabels[field.type]||field.type||'')}</td>
          <td style="text-align:center">${field.is_key?'✓':''}</td>
          <td style="text-align:center">${esc(getFieldStatusRoleLabel(field, 'long') || '')}</td>
          <td>${esc(getFieldRuleText(field) || '')}</td>
        </tr>`).join('')}
      </tbody></table>` : ''}
      ${entity.state_transitions?.length ? `<h4>状态流转</h4>
        ${(() => {
          const statusField = getEntityStatusField(entity);
          const statusLine = statusField
            ? `<p class="pv-note"><strong>主状态字段</strong>: ${esc(statusField.name || '')}（状态列表：${esc(getFieldStateValueText(statusField) || '—')}）</p>`
            : '';
          return `${statusLine}
            <table><thead><tr><th>来源状态</th><th>目标状态</th><th>触发动作</th></tr></thead><tbody>
              ${entity.state_transitions.map((transition) => `<tr><td>${esc(transition.from || '')}</td><td>${esc(transition.to || '')}</td><td>${esc(transition.action || '')}</td></tr>`).join('')}
            </tbody></table>`;
        })()}` : ''}
    </div>`).join('')}`;
}

function buildHtmlPreview() {
  const container = document.getElementById('preview-rendered');
  if(!container || !S.doc) return;
  const doc = S.doc;
  const m   = doc.meta||{};
  const STEP_LBL  = {Query:'查询',Check:'校验',Fill:'填写',Select:'选择',Compute:'计算',Mutate:'变更'};
  const ORCH_LBL = {Query:'查询',Check:'校验',Compute:'计算',Service:'服务',Mutate:'变更',Custom:'自定义'};
  const QUERY_SOURCE_LBL = {Dictionary:'字典',Enum:'枚举',QueryService:'查询服务',Custom:'自定义'};
  const FIELD_LBL = {string:'字符',number:'数值',decimal:'金额',date:'日期',datetime:'日期时间',boolean:'布尔',enum:'枚举',text:'长文本',id:'标识ID'};
  const roles = doc.roles||[];
  const lang = doc.language||[];
  const procs = doc.processes||[];
  const emap  = Object.fromEntries((doc.entities||[]).map(e=>[e.id,e]));
  const entities  = doc.entities||[];
  container.innerHTML = [
    `<h1 id="preview-top">${esc(m.title||m.domain||'未命名')}</h1>`,
    buildPreviewMetaLine(m),
    '<hr>',
    renderPreviewRolesHtml(roles),
    renderPreviewLanguageHtml(lang),
    renderPreviewProcessesHtml(procs, emap, STEP_LBL, ORCH_LBL, QUERY_SOURCE_LBL),
    renderPreviewEntitiesHtml(entities, FIELD_LBL),
  ].filter(Boolean).join('');

  /* Render proc flow diagrams */
  for(const proc of procs) {
    if(getProcNodes(proc).length) {
      renderProcFlow(`pv-proc-${proc.id}`, proc, null);
    }
  }

  /* Render entity flow diagram */
  if(entities.length) {
    renderEntityFlow('pv-entity-diag', doc, null);
  }
}

function appendPreviewRolesMd(add, roles) {
  add('| 角色 | 分组 | 说明 | 所属业务子域 |');
  add('|------|------|------|--------------|');
  roles.forEach((role) => add(`| ${getRoleName(role)} | ${getRoleGroup(role)} | ${getRoleDesc(role)} | ${getRoleSubDomains(role)} |`));
  add('');
}

function appendPreviewLanguageMd(add, languageItems) {
  add('| 术语 | 定义 |');
  add('|------|------|');
  languageItems.forEach((item) => add(`| ${item.term||''} | ${item.definition||''} |`));
  add('');
}

function appendPreviewProcessesMd(add, processes, entityMap, stepLabels, orchestrationLabels, querySourceLabels) {
  for (const proc of processes) {
    const nodes = getProcNodes(proc);
    const prototypeFiles = getProcPrototypeFiles(proc);
    add(`### ${proc.id}: ${proc.name||''}`);
    add('');
    add(`**业务子域**: ${proc.subDomain||'—'}`);
    if(proc.flowGroup) add(`**流程组**: ${proc.flowGroup}`);
    if(prototypeFiles.length) add(`**流程原型**: ${formatPrototypeSummary(prototypeFiles)}`);
    add('');
    if(proc.trigger||proc.outcome){
      add(`**触发**: ${proc.trigger||'—'}  →  **预期结果**: ${proc.outcome||'—'}`);
      add('');
    }
    if(!nodes.length) continue;
    const procCode = buildProcMermaid(proc);
    if(procCode){
      add('```mermaid');
      procCode.split('\n').forEach((line) => add(line));
      add('```');
      add('');
    }
    for (const node of nodes) {
      add(`#### ${node.id}. ${node.name||''}（角色：${getTaskRoleName(node)}）`);
      add('');
      if(node.repeatable) {
        add('> 可退回节点');
        add('');
      }
      const userSteps = getNodeUserSteps(node);
      if(userSteps.length){
        add('| # | 用户操作步骤 | 类型 | 条件/备注 |');
        add('|---|------|------|----------|');
        userSteps.forEach((step, index) => add(`| ${index+1} | ${step.name||''} | ${stepLabels[step.type]||step.type||''} | ${step.note||''} |`));
        add('');
      }
      const orchestrationTasks = getNodeOrchestrationTasks(node);
      if(orchestrationTasks.length){
        add('| # | 编排任务 | 类型 | 查询来源 | 目标 | 备注 |');
        add('|---|-----------|------|----------|------|------|');
        orchestrationTasks.forEach((item, index) => add(`| ${index+1} | ${item.name||''} | ${orchestrationLabels[item.type]||item.type||''} | ${querySourceLabels[item.querySourceKind]||item.querySourceKind||'—'} | ${item.target||''} | ${item.note||''} |`));
        add('');
      }
      const entityOps = node.entity_ops || [];
      if(entityOps.length){
        add(`**涉及实体**: ${entityOps.map((entityOp) => {
          const entityName = (entityMap[entityOp.entity_id]?.name) || entityOp.entity_id;
          return `${entityName}（${(entityOp.ops||[]).join(',')}）`;
        }).join(', ')}`);
        add('');
      }
      if(node.rules_note?.trim()){
        add(`**业务规则**: ${node.rules_note}`);
        add('');
      }
      add('');
    }
  }
}

function appendPreviewEntitiesMd(add, doc, entities, fieldLabels) {
  const entityCode = buildEntityMermaid(doc);
  if(entityCode){
    add('```mermaid');
    entityCode.split('\n').forEach((line) => add(line));
    add('```');
    add('');
  }
  for(const entity of entities){
    add(`### 实体：${entity.name||''}`);
    add('');
    if(entity.note) {
      add(entity.note);
      add('');
    }
    if(entity.fields?.length){
      add('| 字段 | 类型 | 主键 | 状态字段 | 字段规则 |');
      add('|------|------|------|---------|---------|');
      entity.fields.forEach((field) => add(`| ${field.name||''} | ${fieldLabels[field.type]||field.type||''} | ${field.is_key?'✓':''} | ${getFieldStatusRoleLabel(field, 'long') || ''} | ${getFieldRuleText(field)||''} |`));
      add('');
    }
    if(entity.state_transitions?.length){
      const statusField = getEntityStatusField(entity);
      add('#### 状态流转');
      add('');
      if(statusField) {
        add(`**主状态字段**: ${statusField.name||''}（状态列表：${getFieldStateValueText(statusField)||'—'}）`);
        add('');
      }
      add('| 来源状态 | 目标状态 | 触发动作 |');
      add('|----------|----------|----------|');
      entity.state_transitions.forEach((transition) => add(`| ${transition.from||''} | ${transition.to||''} | ${transition.action||''} |`));
      add('');
    }
  }
}

/* 从当前 doc 对象直接生成 MD（等价于服务端 build_md，离线可用） */
function buildMdFromDoc(doc) {
  if(!doc) return '';
  const STEP_LBL  = {Query:'查询',Check:'校验',Fill:'填写',Select:'选择',Compute:'计算',Mutate:'变更'};
  const ORCH_LBL = {Query:'查询',Check:'校验',Compute:'计算',Service:'服务',Mutate:'变更',Custom:'自定义'};
  const QUERY_SOURCE_LBL = {Dictionary:'字典',Enum:'枚举',QueryService:'查询服务',Custom:'自定义'};
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
    appendPreviewRolesMd(add, roles);
    sep();
  }

  const lang = doc.language||[];
  if(lang.length){
    add(`## ${nums[sn++]}、统一语言`); add('');
    appendPreviewLanguageMd(add, lang);
    sep();
  }

  const procs = doc.processes||[];
  const emap  = Object.fromEntries((doc.entities||[]).map(e=>[e.id,e]));
  add(`## ${nums[sn++]}、流程建模`); add('');
  appendPreviewProcessesMd(add, procs, emap, STEP_LBL, ORCH_LBL, QUERY_SOURCE_LBL);
  sep();

  const entities  = doc.entities||[];
  if(entities.length){
    add(`## ${nums[sn++]}、数据建模`); add('');
    appendPreviewEntitiesMd(add, doc, entities, FIELD_LBL);
    sep();
  }

  return L.join('\n');
}

async function doRenderPreview(md) {
  const container = document.getElementById('preview-rendered');
  if(!container) return;
  const {html, diagrams} = renderBlmMd(md);
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
  const body     = document.getElementById('preview-body');
  const raw      = document.getElementById('preview-raw');
  const toggle   = document.getElementById('preview-raw-toggle');
  if(!body || !raw) return;
  const goRaw = !body.classList.contains('hidden');
  body.classList.toggle('hidden', goRaw);
  raw.classList.toggle('hidden', !goRaw);
  if (toggle) toggle.textContent = goRaw ? '返回预览' : '显示原文 MD';
}
