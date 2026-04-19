'use strict';

function setDomain(val) {
  if(!S.doc) return;
  S.doc.meta.domain = val;
  S.doc.meta.title  = val;
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

function selectRole(roleId) {
  ensureSelectedRole(roleId);
  renderDomainTab();
}

function setRoleQuery(value) {
  S.ui.roleQuery = value;
  renderDomainTab();
}

function renameRole(roleId, value) {
  const role = getRoleById(roleId);
  if(!role) return;
  const nextName = normalizeRoleName(value) || role.name;
  const duplicate = getRoles().find((item) => item.id !== roleId && item.name === nextName);
  if(duplicate) {
    alert(`角色“${nextName}”已存在`);
    renderDomainTab();
    return;
  }
  role.name = nextName;
  syncAllTaskRoles();
  markModified();
  renderSidebar();
  render();
}

function setRoleText(roleId, key, value) {
  const role = getRoleById(roleId);
  if(!role) return;
  role[key] = String(value || '').trim();
  markModified();
}

function setRoleTokens(roleId, key, value) {
  const role = getRoleById(roleId);
  if(!role) return;
  role[key] = parseRoleTokens(value);
  markModified();
}

function toggleRoleStatus(roleId) {
  const role = getRoleById(roleId);
  if(!role) return;
  role.status = isRoleDisabled(role) ? 'active' : 'disabled';
  markModified();
  renderDomainTab();
  if(S.ui.tab === 'process' && S.ui.procView === 'role') renderProcessTab();
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
  if(S.ui.tab === 'process' && S.ui.procView === 'role') renderProcessTab();
}

function mergeRole(roleId) {
  const sourceRole = getRoleById(roleId);
  const targetId = normalizeRoleName(document.getElementById('role-merge-target')?.value);
  const targetRole = getRoleById(targetId);
  if(!sourceRole || !targetRole || targetRole.id === sourceRole.id) return;
  const usage = getRoleUsage(sourceRole.id);
  const impactText = usage.length ? `${usage.length} 个任务` : '0 个任务';
  if(!confirm(`确认将“${sourceRole.name}”合并到“${targetRole.name}”？\n将影响 ${impactText}。`)) return;

  for(const { task } of usage) {
    task.role_id = targetRole.id;
    task.role = targetRole.name;
  }

  targetRole.subDomains = parseRoleTokens([...targetRole.subDomains, ...sourceRole.subDomains].join(','));
  targetRole.tags = parseRoleTokens([...targetRole.tags, ...sourceRole.tags].join(','));
  if(!targetRole.desc && sourceRole.desc) targetRole.desc = sourceRole.desc;

  S.doc.roles = getRoles().filter((role) => role.id !== sourceRole.id);
  ensureSelectedRole(targetRole.id);
  markModified();
  renderSidebar();
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

function getFilteredRoles() {
  const query = normalizeRoleName(S.ui.roleQuery).toLowerCase();
  const roles = getRoles();
  if(!query) return roles;
  return roles.filter((role) => {
    const haystack = [
      role.name,
      role.desc,
      ...(role.subDomains || []),
      ...(role.tags || []),
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

function getRoleStatusLabel(role) {
  const usage = getRoleUsageSummary(role.id);
  if(isRoleDisabled(role)) return '已停用';
  return usage.taskCount ? '使用中' : '未使用';
}

function renderRoleUsage(roleId) {
  const grouped = new Map();
  for(const item of getRoleUsage(roleId)) {
    if(!grouped.has(item.proc.id)) {
      grouped.set(item.proc.id, { proc: item.proc, tasks: [] });
    }
    grouped.get(item.proc.id).tasks.push(item.task);
  }
  if(!grouped.size) {
    return '<p class="no-refs">当前角色尚未被任何任务引用</p>';
  }
  return Array.from(grouped.values()).map(({ proc, tasks }) => `
    <div class="role-usage-card">
      <div class="role-usage-head">
        <span class="role-usage-proc">${esc(proc.id)} ${esc(proc.name || '未命名流程')}</span>
        ${proc.subDomain ? `<span class="role-usage-subdomain">${esc(proc.subDomain)}</span>` : ''}
      </div>
      <div class="role-usage-tasks">
        ${tasks.map((task) => `
          <button class="role-task-chip" onclick="navigate('process',{procId:'${esc(proc.id)}',taskId:'${esc(task.id)}'})">
            ${esc(task.id)} ${esc(task.name || '未命名任务')}
          </button>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function renderDomainTab() {
  ensureProcPos(S.doc);
  const meta = S.doc.meta || {};
  const language = S.doc.language || [];
  const filteredRoles = getFilteredRoles();
  const summary = getRoleSummaryCounts();
  ensureSelectedRole(S.ui.roleId || filteredRoles[0]?.id || getRoles()[0]?.id || null);
  const selectedRole = getRoleById(S.ui.roleId);
  const selectedUsage = selectedRole ? getRoleUsageSummary(selectedRole.id) : { subDomainCount: 0, processCount: 0, taskCount: 0 };
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

  h += `<div class="ctx-card">
    <h3>
      <span>角色管理</span>
      <div class="role-toolbar-actions">
        <input id="role-create-input" type="text" placeholder="输入角色名后回车"
          onkeydown="if(event.key==='Enter')addRole()">
        <button class="btn btn-outline btn-sm" data-testid="role-add-button" onclick="addRole()">＋ 新角色</button>
      </div>
    </h3>
    <div class="role-mgmt-toolbar">
      <div class="role-summary-badges">
        <span class="role-summary-badge">角色 ${summary.roleCount}</span>
        <span class="role-summary-badge">使用中 ${summary.activeCount}</span>
        <span class="role-summary-badge">未使用 ${summary.unusedCount}</span>
        <span class="role-summary-badge">已停用 ${summary.disabledCount}</span>
      </div>
      <input class="role-search-input" type="text" value="${esc(S.ui.roleQuery || '')}"
        placeholder="搜索角色、说明、标签、业务子域" oninput="setRoleQuery(this.value)">
    </div>
    <div class="role-mgmt-layout" data-testid="role-management">
      <div class="role-mgmt-list" data-testid="role-list">
        ${filteredRoles.length ? filteredRoles.map((role) => {
          const usage = getRoleUsageSummary(role.id);
          const active = selectedRole?.id === role.id ? ' active' : '';
          return `<button class="role-list-item${active}" data-role-id="${esc(role.id)}"
            data-testid="role-list-item" onclick="selectRole('${esc(role.id)}')">
            <div class="role-list-head">
              <span class="role-list-name">${esc(role.name)}</span>
              <span class="role-status-badge ${isRoleDisabled(role) ? 'is-disabled' : usage.taskCount ? 'is-active' : 'is-idle'}">${getRoleStatusLabel(role)}</span>
            </div>
            ${role.desc ? `<div class="role-list-desc">${esc(role.desc)}</div>` : '<div class="role-list-desc role-list-desc-empty">暂无说明</div>'}
            <div class="role-list-metrics">子域 ${usage.subDomainCount} · 流程 ${usage.processCount} · 任务 ${usage.taskCount}</div>
          </button>`;
        }).join('') : '<div class="role-empty-list">暂无匹配角色</div>'}
      </div>
      <div class="role-mgmt-detail">
        ${selectedRole ? `
          <div class="role-detail-head">
            <div>
              <div class="role-detail-title">${esc(selectedRole.name)}</div>
              <div class="role-detail-subtitle">${getRoleStatusLabel(selectedRole)} · 子域 ${selectedUsage.subDomainCount} · 流程 ${selectedUsage.processCount} · 任务 ${selectedUsage.taskCount}</div>
            </div>
            <div class="role-detail-actions">
              <button class="btn btn-outline btn-sm" data-testid="role-toggle-status-button" onclick="toggleRoleStatus('${esc(selectedRole.id)}')">${isRoleDisabled(selectedRole) ? '启用角色' : '停用角色'}</button>
              <button class="btn btn-ghost-sm" data-testid="role-delete-button" onclick="removeRole('${esc(selectedRole.id)}')" ${selectedUsage.taskCount ? 'disabled' : ''}>删除角色</button>
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>角色名称</label>
              <input type="text" value="${esc(selectedRole.name)}" onchange="renameRole('${esc(selectedRole.id)}',this.value)">
            </div>
            <div class="field-group">
              <label>角色标签</label>
              <input type="text" value="${esc((selectedRole.tags || []).join('，'))}" oninput="setRoleTokens('${esc(selectedRole.id)}','tags',this.value)" placeholder="如：现场、监管、办理">
            </div>
            <div class="field-group form-full">
              <label>角色说明</label>
              <textarea class="auto-resize" rows="2" oninput="setRoleText('${esc(selectedRole.id)}','desc',this.value);autoResize(this)">${esc(selectedRole.desc || '')}</textarea>
            </div>
            <div class="field-group form-full">
              <label>所属业务子域</label>
              <input type="text" value="${esc((selectedRole.subDomains || []).join('，'))}" oninput="setRoleTokens('${esc(selectedRole.id)}','subDomains',this.value)" placeholder="如：仓储仓单管理、交割服务机构管理">
            </div>
          </div>
          <div class="role-merge-row">
            <label>角色合并</label>
            <div class="role-merge-actions">
              <select id="role-merge-target">
                <option value="">选择目标角色...</option>
                ${getRoles()
                  .filter((role) => role.id !== selectedRole.id)
                  .map((role) => `<option value="${esc(role.id)}">${esc(role.name)}${isRoleDisabled(role) ? '（已停用）' : ''}</option>`)
                  .join('')}
              </select>
              <button class="btn btn-outline btn-sm" data-testid="role-merge-button" onclick="mergeRole('${esc(selectedRole.id)}')">合并到目标角色</button>
            </div>
          </div>
          <div class="role-usage-section">
            <h4>使用情况</h4>
            ${renderRoleUsage(selectedRole.id)}
          </div>
        ` : `
          <div class="detail-empty">
            <p>暂无角色，先添加一个角色词典项</p>
          </div>
        `}
      </div>
    </div>
  </div>`;

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
