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

function getSelectedRoleGroupInputValue() {
  const select = document.getElementById('role-create-group-select');
  const customInput = document.getElementById('role-create-group-custom');
  if (!select) return '';
  if (select.value === '__custom__') return normalizeRoleName(customInput?.value || '');
  return normalizeRoleName(select.value);
}

function onRoleGroupSelectChange(value) {
  const customWrap = document.getElementById('role-create-group-custom-wrap');
  const customInput = document.getElementById('role-create-group-custom');
  if (!customWrap) return;
  const showCustom = value === '__custom__';
  customWrap.classList.toggle('hidden', !showCustom);
  if (showCustom) {
    setTimeout(() => customInput?.focus(), 0);
  } else if (customInput) {
    customInput.value = '';
  }
}

function addRole() {
  if (!S.doc) return;
  const nameInput = document.getElementById('role-create-input');
  const roleName = getUniqueRoleName(nameInput?.value || '新角色');
  const roleGroup = getSelectedRoleGroupInputValue();

  if (!roleGroup) {
    alert('请先选择或填写角色分组。');
    const select = document.getElementById('role-create-group-select');
    if (select?.value === '__custom__') {
      document.getElementById('role-create-group-custom')?.focus();
    } else {
      select?.focus();
    }
    return;
  }

  if (!S.doc.roles) S.doc.roles = [];
  const role = createRoleDraft(roleName, { group: roleGroup });
  role.name = roleName;
  role.group = roleGroup;
  S.doc.roles.push(role);

  if (nameInput) nameInput.value = '';
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
  return usage.taskCount ? `${usage.taskCount}T` : '未使用';
}

function renderDomainPanelHeader(title, subtitle, actions = '', options = {}) {
  const tag = options.button ? 'button' : 'div';
  const attrs = [];
  if (options.button) attrs.push('type="button"');
  if (options.onclick) attrs.push(`onclick="${options.onclick}"`);
  if (options.dataTestId) attrs.push(`data-testid="${options.dataTestId}"`);
  if (options.dataPanel) attrs.push(`data-panel="${esc(options.dataPanel)}"`);
  if (options.ariaExpanded !== undefined) attrs.push(`aria-expanded="${options.ariaExpanded ? 'true' : 'false'}"`);
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
  const selectedRole = getRoleById(S.ui.roleId);
  const preferredRoleGroup = selectedRole ? getRoleGroupName(selectedRole) : getDefaultRoleGroup();
  const availableRoleGroups = getAvailableRoleGroups();
  const summaryText = [
    `角色 ${summary.roleCount}`,
    `使用中 ${summary.usedCount}`,
    `未使用 ${summary.unusedCount}`,
  ];

  const groupOptions = availableRoleGroups
    .map((groupName) => `<option value="${esc(groupName)}" ${groupName === preferredRoleGroup ? 'selected' : ''}>${esc(groupName)}</option>`)
    .join('');

  const actions = `
    <div class="role-create-inline">
      <input id="role-create-input" class="role-light-input" type="text" placeholder="角色名称" onkeydown="if(event.key==='Enter')addRole()">
      <select id="role-create-group-select" class="role-light-group-select" onchange="onRoleGroupSelectChange(this.value)">
        ${groupOptions}
        <option value="__custom__">新建分组...</option>
      </select>
      <span id="role-create-group-custom-wrap" class="role-light-group-custom hidden">
        <input id="role-create-group-custom" class="role-light-group-input" type="text" placeholder="输入新分组" onkeydown="if(event.key==='Enter')addRole()">
      </span>
      <button class="btn btn-outline btn-sm" data-testid="role-add-button" onclick="addRole()">添加角色</button>
      <button class="btn btn-outline btn-sm" data-testid="role-view-entry" onclick="openRoleView('${esc(ensureSelectedRole() || '')}')">角色视图</button>
    </div>
  `;

  let h = `<div class="ctx-card domain-panel role-light-card" data-testid="role-summary-card">
    ${renderDomainPanelHeader('角色管理', '', actions, { badge: summaryText.join(' · ') })}`;

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
            <button class="role-light-chip" data-role-id="${esc(role.id)}" data-testid="role-summary-chip" title="${esc(`${role.name}\n分组：${getRoleGroupName(role)}`)}" onclick="openRoleView('${esc(role.id)}')">
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
    h += '<p class="no-refs domain-panel-empty">暂无角色，先在流程任务里明确执行角色，再回到这里统一整理。</p>';
  }

  h += '</div>';
  return h;
}

function renderDomainTab(options = {}) {
  ensureProcPos(S.doc);
  const meta = S.doc.meta || {};
  const language = S.doc.language || [];
  const langCollapsed = S.ui.sbCollapse.lang !== false;

  const languageActions = `<span class="domain-panel-toggle">${langCollapsed ? '展开' : '折叠'}</span>`;
  const languageSubtitle = language.length
    ? `已收录 ${language.length} 条术语，用于统一命名和口径。`
    : '用于固定高频核心名词，避免不同流程叫法不一致。';
  const domainInfoActions = `
    <div class="domain-info-inline" data-testid="domain-info-inline">
      <label class="domain-info-inline-field">
        <span>业务域 <span class="inline-help" tabindex="0" data-tip="这里填写这份建模文档的业务域名称，也可以顺手带上范围或版本，例如：交割智慧监管平台-v2、仓储仓单管理-2026Q2。">?</span></span>
        <input type="text" value="${esc(meta.domain || meta.title || '')}" oninput="setDomain(this.value)" placeholder="如：交割智慧监管平台-v2">
      </label>
      <label class="domain-info-inline-field domain-info-date-field">
        <span>日期</span>
        <input type="text" data-testid="domain-date-input" value="${esc(meta.date || '')}" oninput="setMeta('date',this.value)" placeholder="2026-04">
      </label>
    </div>
  `;

  let h = '<div class="domain-scroll" data-testid="domain-scroll">';

  h += `<div class="ctx-card domain-panel domain-info-card">
    ${renderDomainPanelHeader('业务域信息', '', domainInfoActions)}
  </div>`;

  h += renderRoleSummaryCard();

  h += `<div class="ctx-card domain-panel domain-language-card" data-testid="language-card">
    ${renderDomainPanelHeader(
      '统一语言/术语表',
      languageSubtitle,
      languageActions,
      {
        button: true,
        onclick: "toggleDomainSection('lang')",
        dataTestId: 'language-toggle',
        dataPanel: 'language',
        ariaExpanded: !langCollapsed,
      }
    )}`;

  if (!langCollapsed) {
    h += `<div class="domain-panel-body domain-language-body">
      <div class="domain-language-toolbar">
        <span class="domain-language-hint">建议只保留高频且容易混用的术语，不用追求把所有名词都填满。</span>
        <button class="btn btn-outline btn-sm" onclick="addTerm()">添加术语</button>
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
