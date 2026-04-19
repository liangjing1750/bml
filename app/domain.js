'use strict';

function setDomain(val) {
  if (!S.doc) return;
  S.doc.meta.domain = val;
  S.doc.meta.title = val;
  markModified();
  document.getElementById('file-name').textContent = val || '未命名';
}

function setMeta(key, val) {
  if (!S.doc) return;
  S.doc.meta[key] = val;
  markModified();
}

function rerenderDomainTabPreserveScroll() {
  const scroller = document.querySelector('.domain-scroll');
  renderDomainTab({ scrollTop: scroller ? scroller.scrollTop : 0 });
}

function addRole() {
  if (!S.doc) return;
  const input = document.getElementById('role-create-input');
  const roleName = getUniqueRoleName(input?.value || '新角色');
  if (!S.doc.roles) S.doc.roles = [];
  const role = createRoleDraft(roleName);
  role.name = roleName;
  S.doc.roles.push(role);
  if (input) input.value = '';
  ensureSelectedRole(role.id);
  markModified();
  rerenderDomainTabPreserveScroll();
}

function removeRole(roleId) {
  const usage = getRoleUsage(roleId);
  if (usage.length) {
    alert(`当前角色正在被 ${usage.length} 个任务使用，不能直接删除。`);
    return;
  }
  const role = getRoleById(roleId);
  if (!role) return;
  if (!confirm(`确认删除角色“${role.name}”？`)) return;
  S.doc.roles = getRoles().filter((item) => item.id !== roleId);
  ensureSelectedRole();
  markModified();
  rerenderDomainTabPreserveScroll();
}

function openRoleView(roleId) {
  ensureSelectedRole(roleId);
  S.ui.tab = 'process';
  S.ui.procView = 'role';
  render();
}

function addTerm() {
  S.doc.language.push({ term: '', definition: '' });
  markModified();
  rerenderDomainTabPreserveScroll();
}

function removeTerm(idx) {
  S.doc.language.splice(idx, 1);
  markModified();
  rerenderDomainTabPreserveScroll();
}

function setTerm(idx, key, val) {
  S.doc.language[idx][key] = val;
  markModified();
}

function getLightRoleSummary(role) {
  const usage = getRoleUsageSummary(role.id);
  if (isRoleDisabled(role)) return '已停用';
  return usage.taskCount ? `${usage.taskCount}T` : '未使用';
}

function renderDomainPanelHeader(title, subtitle, actions = '', options = {}) {
  const tag = options.button ? 'button' : 'div';
  const attrs = [];
  if (options.button) attrs.push('type="button"');
  if (options.onclick) attrs.push(`onclick="${options.onclick}"`);
  if (options.dataTestId) attrs.push(`data-testid="${options.dataTestId}"`);
  if (options.dataPanel) attrs.push(`data-panel="${esc(options.dataPanel)}"`);
  return `<${tag} class="domain-panel-head${options.button ? ' domain-panel-head-button' : ''}" ${attrs.join(' ')}>
    <div class="domain-panel-copy">
      <div class="domain-panel-title-row">
        <h3>${esc(title)}</h3>
        ${options.badge ? `<span class="domain-panel-badge">${esc(options.badge)}</span>` : ''}
      </div>
      ${subtitle ? `<p class="domain-panel-subtitle">${esc(subtitle)}</p>` : ''}
    </div>
    ${actions ? `<div class="domain-panel-actions">${actions}</div>` : ''}
  </${tag}>`;
}

function renderRoleSummaryCard() {
  const roleGroups = getGroupedRoles();
  const summary = getRoleSummaryCounts();
  const summaryText = [
    `角色 ${summary.roleCount}`,
    `使用中 ${summary.activeCount}`,
    `未使用 ${summary.unusedCount}`,
  ];
  if (summary.disabledCount) summaryText.push(`已停用 ${summary.disabledCount}`);

  const actions = `
    <input id="role-create-input" class="role-light-input" type="text" placeholder="补充角色名称后回车" onkeydown="if(event.key==='Enter')addRole()">
    <button class="btn btn-outline btn-sm" data-testid="role-add-button" onclick="addRole()">+ 角色</button>
    <button class="btn btn-outline btn-sm" data-testid="role-view-entry" onclick="openRoleView('${esc(ensureSelectedRole() || '')}')">角色视图</button>
  `;

  let h = `<div class="ctx-card domain-panel role-light-card" data-testid="role-summary-card">
    ${renderDomainPanelHeader(
      '角色词典',
      '轻量统一任务执行角色命名，完整参与关系请在“流程 -> 角色视图”查看。',
      actions,
      { badge: summaryText.join(' · ') }
    )}`;

  if (roleGroups.length) {
    h += '<div class="role-light-groups">';
    roleGroups.forEach(({ name, roles }) => {
      const collapseKey = `rolegrp-${name}`;
      const collapsed = S.ui.sbCollapse[collapseKey] === true;
      h += `<div class="role-light-group" data-role-group="${esc(name)}">
        <button type="button" class="role-light-group-head" onclick="toggleDomainSection('${esc(collapseKey)}')">
          <span class="role-light-group-title">
            <span class="role-light-group-caret">${collapsed ? '▸' : '▾'}</span>
            <span>${esc(name)}</span>
          </span>
          <span class="role-light-group-meta">${roles.length} 角色</span>
        </button>`;
      if (!collapsed) {
        h += '<div class="role-light-list">';
        roles.forEach((role) => {
          const usage = getRoleUsageSummary(role.id);
          const removable = usage.taskCount === 0;
          h += `<div class="role-light-chip-wrap">
            <button class="role-light-chip${isRoleDisabled(role) ? ' is-disabled' : ''}" data-role-id="${esc(role.id)}" data-testid="role-summary-chip" onclick="openRoleView('${esc(role.id)}')">
              <span class="role-light-name">${esc(role.name)}</span>
              <span class="role-light-count">${getLightRoleSummary(role)}</span>
            </button>
            ${removable ? `<button class="role-light-remove" title="删除未使用角色" onclick="removeRole('${esc(role.id)}')">×</button>` : ''}
          </div>`;
        });
        h += '</div>';
      }
      h += '</div>';
    });
    h += '</div>';
  } else {
    h += '<p class="no-refs domain-panel-empty">暂无角色词典，先在流程任务里明确执行角色，再回到这里轻量整理。</p>';
  }

  h += '</div>';
  return h;
}

function renderDomainTab(options = {}) {
  ensureProcPos(S.doc);
  const meta = S.doc.meta || {};
  const language = S.doc.language || [];
  const langCollapsed = S.ui.sbCollapse.lang !== false;

  const languageActions = `
    <span class="domain-panel-stat">${language.length ? `${language.length} 条` : '可选'}</span>
    <span class="lang-collapse-btn">${langCollapsed ? '▸' : '▾'}</span>
  `;
  const languageSubtitle = language.length
    ? `已收录 ${language.length} 条术语，用于统一命名和口径。`
    : '可选，用于固定高频核心名词，避免不同流程叫法不一致。';

  let h = '<div class="domain-scroll" data-testid="domain-scroll">';

  h += `<div class="ctx-card domain-panel domain-info-card">
    ${renderDomainPanelHeader('业务域信息', '定义当前建模文档的名称与时间版本。')}
    <div class="domain-panel-body">
      <div class="form-grid">
        <div class="field-group">
          <label>业务域名称</label>
          <input type="text" value="${esc(meta.domain || meta.title || '')}" oninput="setDomain(this.value)" placeholder="如：仓储管理 v2、采购域">
        </div>
        <div class="field-group">
          <label>日期</label>
          <input type="text" data-testid="domain-date-input" value="${esc(meta.date || '')}" oninput="setMeta('date',this.value)" placeholder="2026-04">
        </div>
      </div>
    </div>
  </div>`;

  h += renderRoleSummaryCard();

  h += `<div class="ctx-card domain-panel domain-language-card" data-testid="language-card">
    ${renderDomainPanelHeader(
      '统一语言/术语表',
      languageSubtitle,
      languageActions,
      {
        badge: '可选',
        button: true,
        onclick: "toggleDomainSection('lang')",
        dataTestId: 'language-toggle',
        dataPanel: 'language',
      }
    )}`;

  if (!langCollapsed) {
    h += `<div class="domain-panel-body domain-language-body">
      <div class="domain-language-toolbar">
        <span class="domain-language-hint">建议只保留高频且容易混用的术语，不用追求把所有名词都填满。</span>
        <button class="btn btn-outline btn-sm" onclick="addTerm()">+ 术语</button>
      </div>`;
    if (language.length) {
      h += `<table class="term-table">
        <thead><tr><th>术语</th><th>定义</th><th></th></tr></thead><tbody>`;
      language.forEach((term, index) => {
        h += `<tr>
          <td><input type="text" value="${esc(term.term || '')}" oninput="setTerm(${index},'term',this.value)" placeholder="术语"></td>
          <td><input type="text" value="${esc(term.definition || '')}" oninput="setTerm(${index},'definition',this.value)" placeholder="定义"></td>
          <td><button class="field-del" onclick="removeTerm(${index})">✕</button></td>
        </tr>`;
      });
      h += '</tbody></table>';
    } else {
      h += '<p class="no-refs domain-panel-empty">暂无术语定义。有容易混用的关键名词时再补充即可。</p>';
    }
    h += '</div>';
  }

  h += '</div>';
  h += '</div>';

  document.getElementById('tab-content').innerHTML = h;
  if (Number.isFinite(options.scrollTop)) {
    requestAnimationFrame(() => {
      const scroller = document.querySelector('.domain-scroll');
      if (!scroller) return;
      const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = Math.min(options.scrollTop, maxScrollTop);
    });
  }
}
