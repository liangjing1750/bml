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

function getRoleStatusLabel(role) {
  return typeof role === 'object' && role && role.status === 'disabled' ? '已停用' : '启用';
}

/* ═══════════════════════════════════════════════════════════
   RENDER — Preview Tab
═══════════════════════════════════════════════════════════ */
function renderPreviewTab() {
  document.getElementById('tab-content').innerHTML = `
    <div class="preview-wrap">
      <div class="preview-topbar">
        <button class="btn btn-outline btn-sm" data-testid="preview-export-md" onclick="App.cmdExport('md')">↓ 下载 .md</button>
        <button class="btn btn-outline btn-sm" data-testid="preview-export-json" onclick="App.cmdExport('json')">↓ 下载 .json</button>
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
    h += `<table><thead><tr><th>角色</th><th>分组</th><th>说明</th><th>所属业务子域</th><th>状态</th></tr></thead><tbody>`;
    roles.forEach((role) => {
      h += `<tr>
        <td>${esc(getRoleName(role))}</td>
        <td>${esc(getRoleGroup(role))}</td>
        <td>${esc(getRoleDesc(role))}</td>
        <td>${esc(getRoleSubDomains(role))}</td>
        <td>${esc(getRoleStatusLabel(role))}</td>
      </tr>`;
    });
    h += `</tbody></table>`;
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
          const roleName = getTaskRoleName(t);
          h += `<div class="pv-task-detail">`;
          h += `<h4>${esc(t.id)}: ${esc(t.name||'')} <span class="pv-role">(${esc(roleName)})</span></h4>`;
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
        h += `<table><thead><tr><th>字段</th><th>类型</th><th>主键</th><th>状态字段</th><th>状态值</th><th>公式/约束</th></tr></thead><tbody>`;
        const FIELD_LBL2 = FIELD_LBL;
        e.fields.forEach(f=>{
          h += `<tr><td>${esc(f.name||'')}</td><td>${esc(FIELD_LBL2[f.type]||f.type||'')}</td>`;
          h += `<td style="text-align:center">${f.is_key?'✓':''}</td>`;
          h += `<td style="text-align:center">${f.is_status?'✓':''}</td>`;
          h += `<td>${esc(f.state_values||'')}</td>`;
          h += `<td>${esc(f.note||'')}</td></tr>`;
        });
        h += `</tbody></table>`;
      }
      if(e.state_transitions?.length) {
        const statusField = getEntityStatusField(e);
        h += `<h4>状态流转</h4>`;
        if(statusField) {
          h += `<p class="pv-note"><strong>主状态字段</strong>: ${esc(statusField.name || '')}（状态值：${esc(statusField.state_values || '—')}）</p>`;
        }
        h += `<table><thead><tr><th>来源状态</th><th>目标状态</th><th>触发动作</th><th>责任角色</th><th>说明</th></tr></thead><tbody>`;
        e.state_transitions.forEach((transition) => {
          h += `<tr><td>${esc(transition.from || '')}</td><td>${esc(transition.to || '')}</td><td>${esc(transition.action || '')}</td><td>${esc(getRoleName(transition.role_id || ''))}</td><td>${esc(transition.note || '')}</td></tr>`;
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
    add('| 角色 | 分组 | 说明 | 所属业务子域 | 状态 |');
    add('|------|------|------|--------------|------|');
    roles.forEach((role)=>add(`| ${getRoleName(role)} | ${getRoleGroup(role)} | ${getRoleDesc(role)} | ${getRoleSubDomains(role)} | ${getRoleStatusLabel(role)} |`));
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
        add(`#### ${t.id}. ${t.name||''}（角色：${getTaskRoleName(t)}）`); add('');
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
        add('| 字段 | 类型 | 主键 | 状态字段 | 状态值 | 公式/约束 |');
        add('|------|------|------|---------|--------|---------|');
        e.fields.forEach(f=>add(`| ${f.name||''} | ${FIELD_LBL[f.type]||f.type||''} | ${f.is_key?'✓':''} | ${f.is_status?'✓':''} | ${f.state_values||''} | ${f.note||''} |`));
        add('');
      }
      if(e.state_transitions?.length){
        const statusField = getEntityStatusField(e);
        add('#### 状态流转'); add('');
        if(statusField) {
          add(`**主状态字段**: ${statusField.name||''}（状态值：${statusField.state_values||'—'}）`);
          add('');
        }
        add('| 来源状态 | 目标状态 | 触发动作 | 责任角色 | 说明 |');
        add('|----------|----------|----------|----------|------|');
        e.state_transitions.forEach(t=>add(`| ${t.from||''} | ${t.to||''} | ${t.action||''} | ${getRoleName(t.role_id||'')} | ${t.note||''} |`));
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
  const rendered = document.getElementById('preview-rendered');
  const raw      = document.getElementById('preview-raw');
  if(!rendered || !raw) return;
  const goRaw = !rendered.classList.contains('hidden');
  rendered.classList.toggle('hidden', goRaw);
  raw.classList.toggle('hidden', !goRaw);
}
