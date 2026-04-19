'use strict';

function setDomain(val) {
  if(!S.doc) return;
  S.doc.meta.domain = val;
  S.doc.meta.title = val;
  markModified();
  document.getElementById('file-name').textContent = val || '未命名';
}

function setMeta(key, val) {
  if(!S.doc) return;
  S.doc.meta[key] = val;
  markModified();
}

function addRole() {
  if(!S.doc) return;
  const input = document.getElementById('role-create-input');
  const roleName = getUniqueRoleName(input?.value || '新角色');
  if(!S.doc.roles) S.doc.roles = [];
  const role = createRoleDraft(roleName);
  role.name = roleName;
  S.doc.roles.push(role);
  if(input) input.value = '';
  ensureSelectedRole(role.id);
  markModified();
  renderDomainTab();
}

function removeRole(roleId) {
  const usage = getRoleUsage(roleId);
  if(usage.length) {
    alert(`当前角色正在被 ${usage.length} 个任务使用，不能直接删除。`);
    return;
  }
  const role = getRoleById(roleId);
  if(!role) return;
  if(!confirm(`确认删除角色“${role.name}”？`)) return;
  S.doc.roles = getRoles().filter((item) => item.id !== roleId);
  ensureSelectedRole();
  markModified();
  renderDomainTab();
}

function openRoleView(roleId) {
  ensureSelectedRole(roleId);
  S.ui.tab = 'process';
  S.ui.procView = 'role';
  render();
}

function addTerm() {
  S.doc.language.push({term:'',definition:''});
  markModified();
  render();
}

function removeTerm(idx) {
  S.doc.language.splice(idx,1);
  markModified();
  render();
}

function setTerm(idx,k,val) {
  S.doc.language[idx][k]=val;
  markModified();
}

function getLightRoleSummary(role) {
  const usage = getRoleUsageSummary(role.id);
  if(isRoleDisabled(role)) return '已停用';
  return usage.taskCount ? `${usage.taskCount}T` : '未使用';
}

function renderRoleSummaryCard() {
  const roleGroups = getGroupedRoles();
  const summary = getRoleSummaryCounts();

  let h = `<div class="ctx-card role-light-card" data-testid="role-summary-card">
    <h3>
      <span>角色词典</span>
      <button class="btn btn-outline btn-sm" data-testid="role-view-entry" onclick="openRoleView('${esc(ensureSelectedRole() || '')}')">查看角色视图</button>
    </h3>
    <p class="role-light-tip">角色用于统一任务执行者命名，帮助从责任视角回看流程和任务；详细参与情况请使用“流程 → 角色视图”。</p>
    <div class="role-light-metrics">
      <span class="role-summary-badge">角色 ${summary.roleCount}</span>
      <span class="role-summary-badge">使用中 ${summary.activeCount}</span>
      <span class="role-summary-badge">未使用 ${summary.unusedCount}</span>
      ${summary.disabledCount ? `<span class="role-summary-badge">已停用 ${summary.disabledCount}</span>` : ''}
    </div>`;

  if(roleGroups.length) {
    h += `<div class="role-light-groups">`;
    roleGroups.forEach(({ name, roles }) => {
      const collapseKey = `rolegrp-${name}`;
      const collapsed = S.ui.sbCollapse[collapseKey] === true;
      h += `<div class="role-light-group" data-role-group="${esc(name)}">
        <button class="role-light-group-head" onclick="toggleDomainSection('${esc(collapseKey)}')">
          <span class="role-light-group-title">
            <span class="role-light-group-caret">${collapsed ? '▶' : '▾'}</span>
            <span>${esc(name)}</span>
          </span>
          <span class="sb-count">${roles.length}</span>
        </button>`;
      if(!collapsed) {
        h += `<div class="role-light-list">`;
        roles.forEach((role) => {
          const usage = getRoleUsageSummary(role.id);
          const removable = usage.taskCount === 0;
          h += `<div class="role-light-chip-wrap">
            <button class="role-light-chip${isRoleDisabled(role) ? ' is-disabled' : ''}" data-role-id="${esc(role.id)}"
              data-testid="role-summary-chip" onclick="openRoleView('${esc(role.id)}')">
              <span class="role-light-name">${esc(role.name)}</span>
              <span class="role-light-count">${getLightRoleSummary(role)}</span>
            </button>
            ${removable ? `<button class="role-light-remove" title="删除未使用角色" onclick="removeRole('${esc(role.id)}')">×</button>` : ''}`;
          h += `</div>`;
        });
        h += `</div>`;
      }
      h += `</div>`;
    });
    h += `</div>`;
  } else {
    h += `<p class="no-refs">暂无角色词典，先在流程任务里明确执行角色，再回到这里统一整理。</p>`;
  }

  h += `<div class="role-light-create">
      <input id="role-create-input" type="text" placeholder="补充一个角色名后回车"
        onkeydown="if(event.key==='Enter')addRole()">
      <button class="btn btn-outline btn-sm" data-testid="role-add-button" onclick="addRole()">＋ 添加角色</button>
    </div>
  </div>`;

  return h;
}

function renderDomainTab() {
  ensureProcPos(S.doc);
  const meta = S.doc.meta || {};
  const language = S.doc.language || [];
  const langCollapsed = S.ui.sbCollapse.lang !== false;

  let h = '<div class="domain-scroll">';

  h += `<div class="ctx-card domain-info-card">
    <div class="form-grid">
      <div class="field-group">
        <label>业务域名称</label>
        <input type="text" value="${esc(meta.domain || meta.title || '')}" oninput="setDomain(this.value)" placeholder="如：仓储管理 v2、采购">
      </div>
      <div class="field-group">
        <label>日期</label>
        <input type="text" data-testid="domain-date-input" value="${esc(meta.date || '')}" oninput="setMeta('date',this.value)" placeholder="2026-04">
      </div>
    </div>
  </div>`;

  h += renderRoleSummaryCard();

  h += `<div class="ctx-card domain-language-card">
    <div class="info-bar-row info-bar-lang" onclick="toggleDomainSection('lang')" style="cursor:pointer">
      <span class="info-bar-label">统一语言</span>
      <span class="lang-collapse-btn">${langCollapsed ? '▶' : '▾'}</span>
      ${langCollapsed && language.length ? `<span class="lang-summary">共 ${language.length} 条术语，点击展开</span>` : ''}
      ${langCollapsed && !language.length ? `<span class="lang-summary">暂无术语，点击展开添加</span>` : ''}
      <span style="flex:1"></span>
      ${!langCollapsed ? `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();addTerm()">＋ 添加术语</button>` : ''}
    </div>`;

  if(!langCollapsed) {
    h += `<div class="domain-language-body">`;
    if(language.length) {
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
      h += '<p class="no-refs">暂无术语定义</p>';
    }
    h += '</div>';
  }

  h += '</div>';
  h += '</div>';

  document.getElementById('tab-content').innerHTML = h;
}
