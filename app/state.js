'use strict';

/* ═══════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════ */
const S = {
  files: [],
  currentFile: null,
  doc: null,
  modified: false,
  ui: {
    tab: 'domain',
    procId: null, taskId: null,
    entityId: null,
    dataView: 'relation',
    stateFieldName: '',
    roleId: null,
    roleQuery: '',
    sbCollapse: {},   // { 'proc-P1': true, 'grp-销售': false }
    sidebarCollapsed: false,
    sidebarW: 240,
    procView: 'card',  // 'list' | 'card' | 'role'
    procDrawerW: 480,
    entityDrawerW: 480,
  }
};

const UI_PREFS_KEY = 'blm-ui-prefs';

function loadUiPrefs() {
  try {
    const raw = window.localStorage?.getItem(UI_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function saveUiPrefs(partialPrefs) {
  try {
    const prefs = { ...loadUiPrefs(), ...partialPrefs };
    window.localStorage?.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch (_) {
    // 忽略本地存储不可用的场景
  }
}

function getUiPrefNumber(key, fallback) {
  const value = loadUiPrefs()[key];
  return Number.isFinite(value) ? value : fallback;
}

function getDrawerWidth(kind) {
  return kind === 'process'
    ? (S.ui.procDrawerW || getUiPrefNumber('procDrawerW', 480))
    : (S.ui.entityDrawerW || getUiPrefNumber('entityDrawerW', 480));
}

function getSidebarWidth() {
  return S.ui.sidebarW || getUiPrefNumber('sidebarW', 240);
}

function setSidebarWidth(width) {
  S.ui.sidebarW = width;
  saveUiPrefs({ sidebarW: width });
}

function setDrawerWidth(kind, width) {
  if (kind === 'process') {
    S.ui.procDrawerW = width;
    saveUiPrefs({ procDrawerW: width });
    return;
  }
  S.ui.entityDrawerW = width;
  saveUiPrefs({ entityDrawerW: width });
}

/* ═══════════════════════════════════════════════════════════
   API
═══════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════ */
const STEP_TYPES = [
  {value:'Query',  label:'查询'}, {value:'Check',  label:'校验'},
  {value:'Fill',   label:'填写'}, {value:'Select', label:'选择'},
  {value:'Compute',label:'计算'}, {value:'Mutate', label:'变更'},
  {value:'__other__', label:'其它…'},
];
const FIELD_TYPES = [
  {value:'string',  label:'字符'},  {value:'number',  label:'数值'},
  {value:'decimal', label:'金额'},  {value:'date',    label:'日期'},
  {value:'datetime',label:'日期时间'},{value:'boolean',label:'布尔'},
  {value:'enum',   label:'枚举'},   {value:'text',    label:'长文本'},
  {value:'id',     label:'标识ID'},
];
const ROLE_GROUPS = [
  '业务参与方',
  '仓库作业方',
  '监管与审核方',
  '平台与运维方',
  '系统角色',
  '待分类角色',
];

/* ═══════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════ */
function nextId(prefix, items) {
  const used = new Set((items||[]).map(x=>x.id));
  let i=1; while(used.has(`${prefix}${i}`))i++;
  return `${prefix}${i}`;
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
/* textarea 自动撑高：绑定在 oninput 或渲染后调用 */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight) + 'px';
}
/* 渲染完后批量撑高页面内所有 auto-resize textarea */
function initAutoResize() {
  document.querySelectorAll('textarea.auto-resize').forEach(autoResize);
}
function markModified() {
  if (!S.modified) {
    S.modified = true;
    if (typeof renderToolbar === 'function') renderToolbar();
  }
}
function getEntityName(id) { return S.doc?.entities?.find(e=>e.id===id)?.name||id; }
function currentProc()  { return (S.doc?.processes||[]).find(p=>p.id===S.ui.procId)||null; }
function currentTask()  { return currentProc()?.tasks?.find(t=>t.id===S.ui.taskId)||null; }
function currentEntity() { return (S.doc?.entities||[]).find(e=>e.id===S.ui.entityId)||null; }
function normalizeRoleName(name) { return String(name || '').trim(); }
function normalizeSlashList(value) {
  return String(value || '')
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);
}
function inferStateValuesFromNote(note) {
  const values = normalizeSlashList(note);
  if (!values.length) return [];
  const isCompact = values.every((item) => item.length <= 16 && !/[；;,，。]/.test(item));
  return isCompact ? values : [];
}
function getFieldStateValueText(field) {
  const explicit = String(field?.state_values || '').trim();
  if (explicit) return explicit;
  const inferred = inferStateValuesFromNote(field?.note || '');
  return inferred.join('/');
}
function getFieldRuleText(field) {
  const noteText = String(field?.note || '').trim();
  const stateValueText = getFieldStateValueText(field);
  if (!field?.is_status) return noteText;
  const inferredText = inferStateValuesFromNote(noteText).join('/');
  const noteOnly = noteText && noteText !== stateValueText && inferredText !== stateValueText ? noteText : '';
  if (stateValueText && noteOnly) return `${stateValueText}；${noteOnly}`;
  return noteText || stateValueText;
}
function getFieldStateValues(field) {
  return normalizeSlashList(getFieldStateValueText(field));
}
function getEntityStatusFields(entity) {
  return (entity?.fields || []).filter((field) => field?.is_status);
}
function getEntityStatusField(entity, preferredFieldName = '') {
  const statusFields = getEntityStatusFields(entity);
  if (!statusFields.length) return null;
  const preferred = String(preferredFieldName || '').trim();
  return statusFields.find((field) => field.name === preferred) || statusFields[0];
}
function getEntityStatusValues(entity, preferredFieldName = '') {
  return getFieldStateValues(getEntityStatusField(entity, preferredFieldName));
}
function getEntityStateTransitions(entity, preferredFieldName = '') {
  const fieldName = getEntityStatusField(entity, preferredFieldName)?.name || '';
  return (entity?.state_transitions || [])
    .map((transition, index) => ({ transition, index }))
    .filter(({ transition }) => {
      if (!fieldName) return false;
      return !transition.field_name || transition.field_name === fieldName;
    });
}
function ensureEntityStateShape(entity) {
  if (!entity) return entity;
  if (!Array.isArray(entity.fields)) entity.fields = [];
  if (!Array.isArray(entity.state_transitions)) entity.state_transitions = [];
  entity.fields.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(field, 'state_values')) {
      field.state_values = '';
    }
  });
  entity.state_transitions = entity.state_transitions.map((transition) => ({
    from: String(transition?.from || ''),
    to: String(transition?.to || ''),
    action: String(transition?.action || ''),
    note: String(transition?.note || ''),
    field_name: String(transition?.field_name || ''),
  }));
  return entity;
}
function createStateTransitionDraft(entity, preferredFieldName = '') {
  const field = getEntityStatusField(entity, preferredFieldName);
  const values = getFieldStateValues(field);
  return {
    from: values[0] || '',
    to: values[1] || values[0] || '',
    action: '',
    note: '',
    field_name: field?.name || '',
  };
}
function inferRoleGroup(role) {
  const name = normalizeRoleName(role?.name);
  if (/系统|自动化/.test(name)) return '系统角色';
  if (/仓库|现场|作业/.test(name)) return '仓库作业方';
  if (/平台管理员|超级账号|平台管理|账号管理|运维/.test(name)) return '平台与运维方';
  if (/交割部|交易所|品种负责人|监管|审核/.test(name)) return '监管与审核方';
  if (!name) return '待分类角色';
  return '业务参与方';
}
function getRoleGroupName(role) {
  const explicitGroup = normalizeRoleName(role?.group);
  return explicitGroup || inferRoleGroup(role);
}
function getGroupedRoles() {
  const buckets = new Map();
  for (const groupName of ROLE_GROUPS) {
    buckets.set(groupName, []);
  }
  for (const role of getRoles()) {
    const groupName = getRoleGroupName(role);
    if (!buckets.has(groupName)) buckets.set(groupName, []);
    buckets.get(groupName).push(role);
  }
  return Array.from(buckets.entries())
    .filter(([, roles]) => roles.length)
    .map(([name, roles]) => ({ name, roles }));
}
function getRoles() {
  return Array.isArray(S.doc?.roles)
    ? S.doc.roles.filter((role) => role && typeof role === 'object' && !Array.isArray(role))
    : [];
}
function getRoleById(roleId) {
  const normalizedId = normalizeRoleName(roleId);
  return getRoles().find((role) => role.id === normalizedId) || null;
}
function getRoleByName(roleName) {
  const normalizedName = normalizeRoleName(roleName);
  return getRoles().find((role) => role.name === normalizedName) || null;
}
function getRoleName(roleOrId) {
  if (roleOrId && typeof roleOrId === 'object') {
    return normalizeRoleName(roleOrId.name);
  }
  return normalizeRoleName(getRoleById(roleOrId)?.name || roleOrId);
}
function getTaskRoleId(task) {
  const roleId = normalizeRoleName(task?.role_id);
  if (roleId && getRoleById(roleId)) return roleId;
  const roleName = normalizeRoleName(task?.role);
  return getRoleByName(roleName)?.id || '';
}
function getTaskRoleName(task) {
  return getRoleName(getTaskRoleId(task)) || normalizeRoleName(task?.role);
}
function syncTaskRole(task) {
  if (!task) return;
  const roleId = getTaskRoleId(task);
  task.role_id = roleId;
  task.role = roleId ? getRoleName(roleId) : '';
}
function syncAllTaskRoles() {
  for (const proc of (S.doc?.processes || [])) {
    for (const task of (proc.tasks || [])) {
      syncTaskRole(task);
    }
  }
}
function nextRoleId() {
  const used = new Set(getRoles().map((role) => role.id));
  let index = 1;
  while (used.has(`R${index}`)) index += 1;
  return `R${index}`;
}
function createRoleDraft(name) {
  return {
    id: nextRoleId(),
    name: normalizeRoleName(name) || '新角色',
    desc: '',
    group: '业务参与方',
    subDomains: [],
  };
}
function getUniqueRoleName(baseName) {
  const base = normalizeRoleName(baseName) || '新角色';
  const usedNames = new Set(getRoles().map((role) => role.name));
  if (!usedNames.has(base)) return base;
  let index = 2;
  while (usedNames.has(`${base}${index}`)) index += 1;
  return `${base}${index}`;
}
function ensureSelectedRole(preferredRoleId) {
  const roles = getRoles();
  if (!roles.length) {
    S.ui.roleId = null;
    return null;
  }
  const preferred = normalizeRoleName(preferredRoleId || S.ui.roleId);
  if (preferred && getRoleById(preferred)) {
    S.ui.roleId = preferred;
    return preferred;
  }
  S.ui.roleId = roles[0].id;
  return S.ui.roleId;
}
function parseRoleTokens(value) {
  return Array.from(new Set(
    String(value || '')
      .split(/[，,]/)
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}
const ROLE_GROUP_PRESETS = [
  '业务参与方',
  '仓库作业方',
  '监管与审核方',
  '平台与运维方',
  '系统角色',
  '待分类角色',
];

function inferRoleGroup(role) {
  const name = normalizeRoleName(role?.name);
  if (/系统|自动化/.test(name)) return '系统角色';
  if (/仓库|现场|作业/.test(name)) return '仓库作业方';
  if (/平台管理员|超级账号|平台管理|账号管理|运维/.test(name)) return '平台与运维方';
  if (/交割部|交易所|品种负责人|监管|审核/.test(name)) return '监管与审核方';
  if (!name) return '待分类角色';
  return '业务参与方';
}

function getRoleGroupName(role) {
  const explicitGroup = normalizeRoleName(role?.group);
  return explicitGroup || inferRoleGroup(role);
}

function getAvailableRoleGroups() {
  const groups = [];
  const seen = new Set();
  function pushGroup(groupName) {
    const normalized = normalizeRoleName(groupName);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    groups.push(normalized);
  }

  ROLE_GROUP_PRESETS.forEach(pushGroup);
  getRoles().forEach((role) => pushGroup(getRoleGroupName(role)));
  return groups;
}

function getDefaultRoleGroup() {
  return getAvailableRoleGroups()[0] || '业务参与方';
}

function getGroupedRoles() {
  const buckets = new Map();
  for (const groupName of getAvailableRoleGroups()) {
    buckets.set(groupName, []);
  }
  for (const role of getRoles()) {
    const groupName = getRoleGroupName(role);
    if (!buckets.has(groupName)) buckets.set(groupName, []);
    buckets.get(groupName).push(role);
  }
  return Array.from(buckets.entries())
    .filter(([, roles]) => roles.length)
    .map(([name, roles]) => ({ name, roles }));
}

function createRoleDraft(name, options = {}) {
  return {
    id: nextRoleId(),
    name: normalizeRoleName(name) || '新角色',
    desc: '',
    group: normalizeRoleName(options.group) || getDefaultRoleGroup(),
    subDomains: [],
  };
}

function getUniqueRoleName(baseName) {
  const base = normalizeRoleName(baseName) || '新角色';
  const usedNames = new Set(getRoles().map((role) => role.name));
  if (!usedNames.has(base)) return base;
  let index = 2;
  while (usedNames.has(`${base}${index}`)) index += 1;
  return `${base}${index}`;
}

function parseRoleTokens(value) {
  return Array.from(new Set(
    String(value || '')
      .split(/[，,、;；/\n]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function setTaskRole(procId, taskId, roleId) {
  const task = S.doc?.processes?.find((proc) => proc.id === procId)?.tasks?.find((item) => item.id === taskId);
  if (!task) return;
  const normalizedRoleId = normalizeRoleName(roleId);
  task.role_id = normalizedRoleId;
  task.role = normalizedRoleId ? getRoleName(normalizedRoleId) : '';
  markModified();
}
function getRoleUsage(roleId) {
  const normalizedRoleId = normalizeRoleName(roleId);
  const usage = [];
  for (const proc of (S.doc?.processes || [])) {
    for (const task of (proc.tasks || [])) {
      if (getTaskRoleId(task) !== normalizedRoleId) continue;
      usage.push({ proc, task });
    }
  }
  return usage;
}
function getRoleUsageSummary(roleId) {
  const usage = getRoleUsage(roleId);
  const processIds = new Set(usage.map((item) => item.proc.id));
  const subDomains = new Set(usage.map((item) => normalizeRoleName(item.proc.subDomain)).filter(Boolean));
  return {
    taskCount: usage.length,
    processCount: processIds.size,
    subDomainCount: subDomains.size,
  };
}
function getRoleUsageByProcess(roleId) {
  const usageByProcess = new Map();
  for (const item of getRoleUsage(roleId)) {
    if (!usageByProcess.has(item.proc.id)) {
      usageByProcess.set(item.proc.id, { proc: item.proc, tasks: [] });
    }
    usageByProcess.get(item.proc.id).tasks.push(item.task);
  }
  return usageByProcess;
}
function getRoleSummaryCounts() {
  const roles = getRoles();
  let usedCount = 0;
  let unusedCount = 0;
  roles.forEach((role) => {
    const usage = getRoleUsageSummary(role.id);
    if (usage.taskCount === 0) unusedCount += 1;
    else usedCount += 1;
  });
  return {
    roleCount: roles.length,
    usedCount,
    unusedCount,
  };
}

function getTasksReferencingEntity(entityId) {
  const result=[];
  for(const proc of (S.doc?.processes||[])) {
    for(const task of (proc.tasks||[])) {
      if((task.entity_ops||[]).some(eo=>eo.entity_id===entityId))
        result.push({proc,task});
    }
  }
  return result;
}

/* ═══════════════════════════════════════════════════════════
   MERMAID HELPERS
═══════════════════════════════════════════════════════════ */
/* 6色循环色板（pastel，不刺眼） */
const ROLE_COLORS = [
  { fill:'#dbeafe', stroke:'#3b82f6', color:'#1e3a8a' }, // 蓝
  { fill:'#dcfce7', stroke:'#22c55e', color:'#14532d' }, // 绿
  { fill:'#fef9c3', stroke:'#eab308', color:'#713f12' }, // 黄
  { fill:'#fce7f3', stroke:'#ec4899', color:'#831843' }, // 粉
  { fill:'#ede9fe', stroke:'#8b5cf6', color:'#3b0764' }, // 紫
  { fill:'#ffedd5', stroke:'#f97316', color:'#7c2d12' }, // 橙
];
