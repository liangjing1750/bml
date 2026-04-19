'use strict';

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
    sbCollapse: {},   // { 'proc-P1': true, 'grp-销售': false }
    sidebarCollapsed: false,
    procView: 'card',  // 'list' | 'card'
    procDrawerW: 480,
    entityDrawerW: 480,
  }
};

const UI_PREFS_KEY = 'bml-ui-prefs';

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
    document.getElementById('modified-dot')?.classList.remove('hidden');
  }
}
function getEntityName(id) { return S.doc?.entities?.find(e=>e.id===id)?.name||id; }
function currentProc()  { return (S.doc?.processes||[]).find(p=>p.id===S.ui.procId)||null; }
function currentTask()  { return currentProc()?.tasks?.find(t=>t.id===S.ui.taskId)||null; }
function getRoles()     { return S.doc?.roles||[]; }

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
