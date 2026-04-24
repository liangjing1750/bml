'use strict';

const UNSAVED_CHANGES_MESSAGE = '当前有未保存修改，继续操作会丢失这些内容。是否继续？';

function confirmDiscardUnsavedChanges(actionLabel = '') {
  if (!S.modified) return true;
  const actionText = String(actionLabel || '').trim();
  const message = actionText
    ? `当前有未保存修改，继续${actionText}会丢失这些内容。是否继续？`
    : UNSAVED_CHANGES_MESSAGE;
  return window.confirm(message);
}

function bindBeforeUnloadWarning() {
  window.addEventListener('beforeunload', (event) => {
    if (!S.modified) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

function createLocalDocument(name) {
  return {
    meta: { title: name, domain: name, author: '', date: '' },
    roles: [],
    language: [],
    stages: [],
    stageLinks: [],
    processes: [{ id: 'P1', name: '主流程', subDomain: '', flowGroup: '', stageId: '', stagePos: { x: 0, y: 0 }, trigger: '', outcome: '', prototypeFiles: [], nodes: [] }],
    entities: [],
    relations: [],
    rules: [],
  };
}

function getFirstRoleId(doc) {
  return Array.isArray(doc?.roles) && doc.roles.length && typeof doc.roles[0] === 'object'
    ? doc.roles[0].id
    : null;
}

function isStatusFieldCandidate(field) {
  const statusRole = String(field?.status_role || '');
  return statusRole === 'primary' || statusRole === 'secondary' || Boolean(field?.is_status || field?.isStatus);
}

function captureUiViewportState() {
  const scrollRoot = document.scrollingElement || document.documentElement;
  const selectors = [
    '.live-diagram',
    '.stage-main-shell',
    '.stage-drawer .drawer-body',
    '.proc-drawer .drawer-body',
    '.entity-drawer .drawer-body',
    '.entity-state-browser',
    '.entity-state-main-shell',
    '.state-editor-drawer .drawer-body',
  ];
  return {
    pageTop: scrollRoot?.scrollTop || 0,
    pageLeft: scrollRoot?.scrollLeft || 0,
    elementScrolls: selectors.map((selector) => {
      const node = document.querySelector(selector);
      return node
        ? { selector, top: node.scrollTop || 0, left: node.scrollLeft || 0 }
        : null;
    }).filter(Boolean),
  };
}

function restoreUiViewportState(snapshot) {
  if (!snapshot) return;
  requestAnimationFrame(() => {
    const scrollRoot = document.scrollingElement || document.documentElement;
    if (scrollRoot) {
      scrollRoot.scrollTop = snapshot.pageTop || 0;
      scrollRoot.scrollLeft = snapshot.pageLeft || 0;
    }
    (snapshot.elementScrolls || []).forEach(({ selector, top, left }) => {
      const node = document.querySelector(selector);
      if (!node) return;
      node.scrollTop = top || 0;
      node.scrollLeft = left || 0;
    });
  });
}

function getPreservedDocUiState(doc, sourceUi = {}) {
  const base = createDocUiState(doc);
  const next = {
    ...base,
    ...sourceUi,
    sbCollapse: sourceUi && typeof sourceUi.sbCollapse === 'object'
      ? { ...sourceUi.sbCollapse }
      : { ...base.sbCollapse },
    procPrototypeExpanded: sourceUi && typeof sourceUi.procPrototypeExpanded === 'object'
      ? { ...sourceUi.procPrototypeExpanded }
      : { ...base.procPrototypeExpanded },
    procRolePickerCollapsed: sourceUi && typeof sourceUi.procRolePickerCollapsed === 'object'
      ? { ...sourceUi.procRolePickerCollapsed }
      : { ...base.procRolePickerCollapsed },
  };

  const validTabs = new Set(['domain', 'process', 'data', 'rules', 'preview', 'manual']);
  if (!validTabs.has(String(next.tab || ''))) next.tab = base.tab;

  const validProcViews = new Set(['stage', 'list', 'card', 'role']);
  if (!validProcViews.has(String(next.procView || ''))) next.procView = base.procView;

  const validStageViewModes = new Set(['panorama', 'detail']);
  if (!validStageViewModes.has(String(next.stageViewMode || ''))) next.stageViewMode = base.stageViewMode;

  const validNodePerspectives = new Set(['user', 'task']);
  if (!validNodePerspectives.has(String(next.nodePerspective || ''))) next.nodePerspective = base.nodePerspective;

  const validDataViews = new Set(['relation', 'state']);
  if (!validDataViews.has(String(next.dataView || ''))) next.dataView = base.dataView;

  next.sidebarCollapsed = Boolean(next.sidebarCollapsed);
  next.sidebarW = Math.max(200, Number(next.sidebarW) || base.sidebarW);
  next.procDiagramH = Math.max(140, Number(next.procDiagramH) || base.procDiagramH);
  next.procDrawerW = Math.max(360, Number(next.procDrawerW) || base.procDrawerW);
  next.entityDrawerW = Math.max(620, Number(next.entityDrawerW) || base.entityDrawerW);
  next.stageGraphZoom = Math.max(0.6, Math.min(1.8, Number(next.stageGraphZoom) || base.stageGraphZoom));
  next.roleQuery = String(next.roleQuery || '');
  next.procEditorFocusSelector = String(next.procEditorFocusSelector || '');

  const processes = Array.isArray(doc?.processes) ? doc.processes : [];
  if (!processes.some((proc) => proc?.id === next.procId)) {
    next.procId = base.procId;
  }
  const activeProc = processes.find((proc) => proc?.id === next.procId) || null;
  const procNodes = Array.isArray(activeProc?.nodes) ? activeProc.nodes : [];
  if (!procNodes.some((node) => node?.id === next.taskId)) {
    next.taskId = null;
  }

  const stageItems = getStageItems(doc);
  if (!stageItems.some((stage) => stage?.id === next.stageId)) {
    next.stageId = base.stageId;
  }

  const entities = Array.isArray(doc?.entities) ? doc.entities : [];
  if (!entities.some((entity) => entity?.id === next.entityId)) {
    next.entityId = entities[0]?.id || null;
  }
  const activeEntity = entities.find((entity) => entity?.id === next.entityId) || null;
  const statusFieldNames = (Array.isArray(activeEntity?.fields) ? activeEntity.fields : [])
    .filter((field) => isStatusFieldCandidate(field))
    .map((field) => String(field?.name || ''))
    .filter(Boolean);
  if (!statusFieldNames.includes(String(next.stateFieldName || ''))) {
    next.stateFieldName = statusFieldNames[0] || '';
  }

  const roles = Array.isArray(doc?.roles) ? doc.roles : [];
  if (!roles.some((role) => role && typeof role === 'object' && role.id === next.roleId)) {
    next.roleId = getFirstRoleId(doc);
  }

  return next;
}

function setActiveDocumentSession(doc, options = {}) {
  const previousUi = options.preserveUiState ? S.ui : null;
  const previousViewport = options.preserveUiState ? captureUiViewportState() : null;
  hydrateDocumentForUi(doc);
  if (doc.meta && !doc.meta.domain) {
    doc.meta.domain = options.domain || options.fileName || '';
  }
  S.doc = doc;
  S.currentFile = options.fileName || null;
  S.modified = false;
  S.ui = options.preserveUiState
    ? getPreservedDocUiState(doc, previousUi)
    : createDocUiState(doc);
  render();
  if (options.preserveUiState) {
    restoreUiViewportState(previousViewport);
  }
}

function closeModalById(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function openModalById(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

function renderWorkspaceFileList(files) {
  const fileList = document.getElementById('file-list');
  if (!fileList) return;
  fileList.innerHTML = files.length
    ? files.map((fileName) => `
        <div class="file-list-item" onclick='App.openFile(${JSON.stringify(fileName)})'>
          <button class="file-list-item-main" type="button">
            <span class="file-list-item-name">${esc(fileName)}</span>
          </button>
          <div class="file-list-item-actions">
            <button class="btn btn-outline btn-sm" type="button"
              onclick='event.stopPropagation();App.openHistoryModal(${JSON.stringify(fileName)})'>历史</button>
            <button class="file-list-item-del" type="button"
              onclick='event.stopPropagation();App.deleteFile(${JSON.stringify(fileName)})' title="删除">×</button>
          </div>
        </div>`).join('')
    : '<div class="file-empty">暂无工作区文档。</div>';
}

function renderHistoryEntries(docName, entries) {
  const subtitle = document.getElementById('history-modal-subtitle');
  if (subtitle) {
    subtitle.textContent = docName ? `当前文档：${docName}` : '';
  }
  const list = document.getElementById('history-list');
  if (!list) return;
  if (!entries.length) {
    list.innerHTML = '<div class="file-empty">当前文档还没有历史快照。</div>';
    return;
  }
  list.innerHTML = entries.map((entry) => `
    <div class="recovery-item">
      <div class="recovery-item-main">
        <div class="recovery-item-title">${esc(entry.label || entry.id || '')}</div>
        <div class="recovery-item-meta">恢复前会先自动保存当前版本快照。</div>
      </div>
      <button class="btn btn-primary btn-sm" type="button"
        onclick='App.restoreHistory(${JSON.stringify(docName)}, ${JSON.stringify(entry.id)})'>恢复</button>
    </div>`).join('');
}

function renderTrashEntries(entries) {
  const list = document.getElementById('trash-list');
  if (!list) return;
  if (!entries.length) {
    list.innerHTML = '<div class="file-empty">回收站当前为空。</div>';
    return;
  }
  list.innerHTML = entries.map((entry) => `
    <div class="recovery-item">
      <div class="recovery-item-main">
        <div class="recovery-item-title">${esc(entry.doc_name || '')}</div>
        <div class="recovery-item-meta">${esc(entry.timestamp || '')}</div>
      </div>
      <button class="btn btn-primary btn-sm" type="button"
        onclick='App.restoreTrash(${JSON.stringify(entry.id)})'>恢复</button>
    </div>`).join('');
}

function syncOpenModalTabs() {
  const activeTab = S.recovery.openTab || 'workspace';
  document.querySelectorAll('[data-open-tab]').forEach((button) => {
    button.classList.toggle('active', button.getAttribute('data-open-tab') === activeTab);
  });
  document.getElementById('open-workspace-panel')?.classList.toggle('hidden', activeTab !== 'workspace');
  document.getElementById('open-trash-panel')?.classList.toggle('hidden', activeTab !== 'trash');
}

function renderMergeWorkspaceList() {
  const files = S.merge.workspaceFiles || [];
  const leftSelect = document.getElementById('merge-left-select');
  const rightSelect = document.getElementById('merge-right-select');
  if (!leftSelect || !rightSelect) return;
  const options = ['<option value="">请选择文档</option>']
    .concat(files.map((fileName) => `<option value="${esc(fileName)}">${esc(fileName)}</option>`))
    .join('');
  leftSelect.innerHTML = options;
  rightSelect.innerHTML = options;
  leftSelect.value = S.merge.workspaceNames?.left || '';
  rightSelect.value = S.merge.workspaceNames?.right || '';
}

function syncMergeWorkspaceUi() {
  renderMergeWorkspaceList();
}

function clearMergeAnalysisState() {
  S.merge.analysis = null;
  S.merge.resolutions = {};
  renderMergeAnalysis(null);
}

function setMergeSource(kind, { workspaceName = '', label = '', document = null } = {}) {
  S.merge.workspaceNames[kind] = workspaceName;
  S.merge.labels[kind] = label || workspaceName;
  S.merge.documents[kind] = document;
  clearMergeAnalysisState();
  syncMergeWorkspaceUi();
}

function getMergeSelectedName(kind) {
  const select = document.getElementById(`merge-${kind}-select`);
  const selected = String(select?.value || '').trim();
  return selected || String(S.merge.workspaceNames?.[kind] || '').trim();
}

async function ensureMergeWorkspaceDocuments() {
  const payload = { mode: 'combine' };
  for (const kind of ['left', 'right']) {
    const selectedName = getMergeSelectedName(kind);
    if (!selectedName) continue;
    if (S.merge.workspaceNames?.[kind] !== selectedName || !S.merge.documents?.[kind]) {
      const document = await api.load(selectedName);
      if (document.error) {
        return { error: document.error };
      }
      S.merge.workspaceNames[kind] = selectedName;
      S.merge.labels[kind] = selectedName;
      S.merge.documents[kind] = document;
    }
    payload[`${kind}_document`] = S.merge.documents[kind];
  }
  syncMergeWorkspaceUi();
  return payload;
}

function stripJsonExtension(name) {
  return String(name || '').replace(/\.json$/i, '');
}

function getMergeResultDraftName() {
  const [firstName, secondName] = [
    stripJsonExtension(S.merge.labels?.left || S.merge.workspaceNames?.left || 'left'),
    stripJsonExtension(S.merge.labels?.right || S.merge.workspaceNames?.right || 'right'),
  ].sort((leftName, rightName) => leftName.localeCompare(rightName, 'zh-CN'));
  return `${firstName}-${secondName}-合并`;
}

function getMergeSaveName(result) {
  return String(
    result?.suggested_name
      || result?.merged_document?.meta?.domain
      || result?.merged_document?.meta?.title
      || getMergeResultDraftName(),
  ).trim();
}

async function loadWorkspaceDocumentNames() {
  const files = await api.files();
  if (files.error) {
    alert(files.error);
    return null;
  }
  S.files = Array.isArray(files) ? files : [];
  return S.files;
}

async function loadWorkspaceTrashEntries() {
  const entries = await api.trash();
  if (entries.error) {
    alert(entries.error);
    return null;
  }
  S.recovery.trashEntries = Array.isArray(entries) ? entries : [];
  return S.recovery.trashEntries;
}

function getSaveDialogMeta() {
  if (S.saveDialogMode === 'copy') {
    return {
      toolbarLabel: '复制',
      title: '复制文档',
      confirmLabel: '确认复制',
      placeholder: '输入新文档名称，例如：仓储仓单管理-副本',
    };
  }
  return {
    toolbarLabel: '复制',
    title: '保存文档',
    confirmLabel: '确认保存',
    placeholder: '输入文档名称，例如：仓储仓单管理-v2',
  };
}

function refreshSaveDialogText() {
  const meta = getSaveDialogMeta();
  const toolbarButton = document.getElementById('toolbar-save-as-label');
  const modalTitle = document.getElementById('save-as-modal-title');
  const confirmButton = document.getElementById('save-as-confirm-label');
  const input = document.getElementById('save-as-name');
  if (toolbarButton) {
    toolbarButton.textContent = meta.toolbarLabel;
  }
  if (modalTitle) {
    modalTitle.textContent = meta.title;
  }
  if (confirmButton) {
    confirmButton.textContent = meta.confirmLabel;
  }
  if (input) {
    input.placeholder = meta.placeholder;
  }
}

function buildSuggestedCopyName(baseName, existingNames = []) {
  const normalizedBase = String(baseName || '').trim() || '文档';
  const usedNames = new Set((existingNames || []).map((name) => String(name || '').trim()).filter(Boolean));
  const primary = `${normalizedBase}-副本`;
  if (!usedNames.has(primary)) return primary;
  let index = 2;
  while (usedNames.has(`${primary}${index}`)) {
    index += 1;
  }
  return `${primary}${index}`;
}

function openWorkspaceSaveAsModal(initialName = '', mode = 'save') {
  S.saveDialogMode = mode === 'copy' ? 'copy' : 'save';
  refreshSaveDialogText();
  const input = document.getElementById('save-as-name');
  if (input) {
    input.value = String(initialName || '').trim();
  }
  openModalById('save-as-modal-overlay');
  setTimeout(() => input?.focus(), 50);
}

async function saveWorkspaceDocument(targetName, document, { currentName = '', allowOverwrite = true } = {}) {
  const normalizedName = String(targetName || '').trim();
  if (!normalizedName) {
    alert('请输入业务域名称');
    return null;
  }

  const workspaceFiles = await loadWorkspaceDocumentNames();
  if (!workspaceFiles) return null;

  const willOverwrite = workspaceFiles.includes(normalizedName) && normalizedName !== currentName;
  if (willOverwrite) {
    if (!allowOverwrite) {
      alert(`已存在同名文档“${normalizedName}”，请使用其他名称。`);
      return null;
    }
    if (!window.confirm(`已存在同名文档“${normalizedName}”，是否覆盖？`)) {
      return null;
    }
  }

  const result = currentName && currentName !== normalizedName
    ? await api.rename(currentName, normalizedName, document, willOverwrite)
    : await api.save(normalizedName, document);
  if (result.error) {
    alert(result.error);
    return null;
  }

  await loadWorkspaceDocumentNames();
  return result;
}

function renderMergeAnalysis(analysis) {
  const panel = document.getElementById('merge-analysis');
  if (!panel) return;
  if (!analysis) {
    panel.innerHTML = '';
    return;
  }

  const merged = analysis.merged_document || {};
  const summary = analysis.summary || {};
  const conflicts = analysis.conflicts || [];
  const validation = analysis.validation_issues || [];

  panel.innerHTML = `
    <div class="merge-summary">
      <div class="merge-summary-card"><strong>${summary.autoMergedCount || 0}</strong><span>自动合并项</span></div>
      <div class="merge-summary-card"><strong>${conflicts.length}</strong><span>冲突项</span></div>
      <div class="merge-summary-card"><strong>${validation.length}</strong><span>校验问题</span></div>
      <div class="merge-summary-card"><strong>${(merged.processes || []).length}</strong><span>流程</span></div>
      <div class="merge-summary-card"><strong>${(merged.entities || []).length}</strong><span>实体</span></div>
    </div>
    ${conflicts.length ? `<div class="merge-block">
      <h4>冲突裁决</h4>
      <div class="merge-conflict-list">
        ${conflicts.map((conflict, index) => renderMergeConflict(conflict, index)).join('')}
      </div>
    </div>` : '<div class="merge-block merge-ok">未检测到冲突，可以直接生成结果。</div>'}
    ${validation.length ? `<div class="merge-block">
      <h4>校验问题</h4>
      <ul class="merge-warning-list">
        ${validation.map((item) => `<li>${esc(item.message || '')}</li>`).join('')}
      </ul>
    </div>` : ''}
    <div class="merge-block">
      <h4>结果预览</h4>
      <div class="merge-preview-metrics">
        <span>标题：${esc(merged.meta?.title || '未命名')}</span>
        <span>业务域：${esc(merged.meta?.domain || '')}</span>
        <span>角色：${(merged.roles || []).length}</span>
        <span>术语：${(merged.language || []).length}</span>
      </div>
    </div>`;
}

function renderMergeConflict(conflict, index) {
  const conflictId = esc(conflict.id);
  const choiceOptions = (conflict.resolution_options || []).map((choice) => {
    const label = choice === 'left'
      ? '保留左侧'
      : choice === 'right'
        ? '保留右侧'
        : choice === 'keep_both'
          ? '两者都保留'
          : '自定义';
    return `<option value="${choice}">${label}</option>`;
  }).join('');
  const supportsCustom = (conflict.resolution_options || []).includes('custom');
  return `<div class="merge-conflict-card">
    <div class="merge-conflict-head">
      <span class="merge-conflict-index">#${index + 1}</span>
      <strong>${esc(conflict.label || conflict.path || '冲突')}</strong>
      <span class="merge-conflict-path">${esc(conflict.path || '')}</span>
    </div>
    <div class="merge-conflict-values">
      <div><label>左侧</label><pre>${esc(JSON.stringify(conflict.left_value, null, 2))}</pre></div>
      <div><label>右侧</label><pre>${esc(JSON.stringify(conflict.right_value, null, 2))}</pre></div>
    </div>
    <div class="merge-conflict-controls">
      <select data-merge-conflict="${conflictId}" onchange="toggleMergeCustomInput(this)">
        <option value="">请选择处理方式</option>
        ${choiceOptions}
      </select>
      ${supportsCustom ? `<input class="merge-custom-input hidden" data-merge-custom="${conflictId}" placeholder="输入自定义值">` : ''}
    </div>
  </div>`;
}

function toggleMergeCustomInput(selectEl) {
  const conflictId = selectEl.getAttribute('data-merge-conflict');
  const input = document.querySelector(`[data-merge-custom="${conflictId}"]`);
  if (!input) return;
  input.classList.toggle('hidden', selectEl.value !== 'custom');
}

function collectMergeResolutions(conflicts) {
  const resolutions = {};
  (conflicts || []).forEach((conflict) => {
    const select = document.querySelector(`[data-merge-conflict="${conflict.id}"]`);
    if (!select || !select.value) return;
    if (select.value === 'custom') {
      const input = document.querySelector(`[data-merge-custom="${conflict.id}"]`);
      resolutions[conflict.id] = {
        choice: 'custom',
        custom_value: input ? input.value : '',
      };
      return;
    }
    resolutions[conflict.id] = { choice: select.value };
  });
  return resolutions;
}

function cloneDocument(document) {
  return JSON.parse(JSON.stringify(document || {}));
}

const App = {
  _downloadBlob(content, type, filename) {
    const blob = new Blob([content], { type });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  },

  cmdNew() {
    if (!confirmDiscardUnsavedChanges('新建文档')) return;
    document.getElementById('new-doc-name').value = '';
    openModalById('modal-overlay');
    setTimeout(() => document.getElementById('new-doc-name')?.focus(), 50);
  },

  closeModal() {
    closeModalById('modal-overlay');
  },

  async confirmNew() {
    const name = document.getElementById('new-doc-name').value.trim();
    if (!name) return alert('请输入名称');

    const newDocument = createLocalDocument(name);
    const saveResult = await saveWorkspaceDocument(name, newDocument);
    if (!saveResult) return;

    App.closeModal();
    setActiveDocumentSession(saveResult.document || newDocument, { fileName: saveResult.name || name });
  },

  async cmdOpen() {
    resetRecoveryState();
    const [files, trashEntries] = await Promise.all([
      loadWorkspaceDocumentNames(),
      loadWorkspaceTrashEntries(),
    ]);
    if (!files || !trashEntries) return;
    renderWorkspaceFileList(files);
    renderTrashEntries(trashEntries);
    syncOpenModalTabs();
    openModalById('open-modal-overlay');
  },

  closeOpenModal() {
    closeModalById('open-modal-overlay');
  },

  switchOpenTab(tab) {
    S.recovery.openTab = tab === 'trash' ? 'trash' : 'workspace';
    syncOpenModalTabs();
  },

  async openHistoryModal(name) {
    if (!name) return;
    const entries = await api.history(name);
    if (entries.error) return alert(entries.error);
    S.recovery.historyDocName = name;
    S.recovery.historyEntries = Array.isArray(entries) ? entries : [];
    renderHistoryEntries(name, S.recovery.historyEntries);
    openModalById('history-modal-overlay');
  },

  closeHistoryModal() {
    S.recovery.historyDocName = '';
    S.recovery.historyEntries = [];
    closeModalById('history-modal-overlay');
  },

  async restoreHistory(name, snapshotId) {
    if (!confirmDiscardUnsavedChanges('恢复历史版本')) return;
    const result = await api.restoreHistory(name, snapshotId);
    if (result.error) return alert(result.error);
    resetRecoveryState();
    App.closeHistoryModal();
    App.closeOpenModal();
    setActiveDocumentSession(result.document, { fileName: result.name || name });
  },

  async restoreTrash(entryId) {
    if (!confirmDiscardUnsavedChanges('恢复回收站文档')) return;
    const result = await api.restoreTrash(entryId);
    if (result.error) return alert(result.error);
    resetRecoveryState();
    App.closeOpenModal();
    setActiveDocumentSession(result.document, { fileName: result.name });
  },

  async cmdSaveAs() {
    if (!S.doc) return;
    const workspaceFiles = await loadWorkspaceDocumentNames();
    if (!workspaceFiles) return;
    const baseName = (S.doc.meta?.domain || S.currentFile || S.doc.meta?.title || '').trim() || '文档';
    openWorkspaceSaveAsModal(buildSuggestedCopyName(baseName, workspaceFiles), 'copy');
  },

  closeSaveAsModal() {
    S.saveDialogMode = 'save';
    refreshSaveDialogText();
    closeModalById('save-as-modal-overlay');
  },

  async openFile(name) {
    if (!confirmDiscardUnsavedChanges(`打开“${name}”`)) return;
    App.closeOpenModal();
    const doc = await api.load(name);
    if (doc.meta && !doc.meta.domain) doc.meta.domain = name;
    setActiveDocumentSession(doc, { fileName: name });
  },

  async deleteFile(name) {
    if (S.currentFile === name && !confirmDiscardUnsavedChanges(`删除“${name}”`)) return;
    if (!confirm(`确认删除 "${name}"？`)) return;
    await api.del(name);
    if (S.currentFile === name) {
      S.currentFile = null;
      S.doc = null;
      S.modified = false;
      render();
    }
    await App.cmdOpen();
  },

  async cmdSave() {
    if (!S.doc) return;
    if (!S.currentFile) {
      openWorkspaceSaveAsModal((S.doc.meta?.domain || S.doc.meta?.title || '').trim(), 'save');
      return;
    }

    const targetName = String(S.doc.meta?.domain || S.currentFile || '').trim() || S.currentFile;
    S.doc.meta = S.doc.meta || {};
    S.doc.meta.domain = targetName;
    S.doc.meta.title = targetName;
    const saveResult = await saveWorkspaceDocument(targetName, S.doc, { currentName: S.currentFile });
    if (!saveResult) return;
    setActiveDocumentSession(saveResult.document || S.doc, {
      fileName: saveResult.name || targetName,
      preserveUiState: true,
    });
  },

  async confirmSaveAs() {
    if (!S.doc) return;
    const name = document.getElementById('save-as-name').value.trim();
    if (!name) return alert('请输入业务域名称');

    const mode = S.saveDialogMode === 'copy' ? 'copy' : 'save';
    const nextDocument = cloneDocument(S.doc);
    nextDocument.meta = nextDocument.meta || {};
    nextDocument.meta.domain = name;
    nextDocument.meta.title = name;
    const saveResult = mode === 'copy'
      ? await saveWorkspaceDocument(name, nextDocument, { allowOverwrite: false })
      : await saveWorkspaceDocument(name, nextDocument, { currentName: S.currentFile || '' });
    if (!saveResult) return;

    App.closeSaveAsModal();
    setActiveDocumentSession(saveResult.document || nextDocument, {
      fileName: saveResult.name || name,
      preserveUiState: true,
    });
  },

  async cmdExport() {
    if (!S.doc) return;
    await App.cmdSave();
    if (!S.currentFile || S.modified) return;

    const bundleName = `${S.currentFile || S.doc.meta?.domain || getCurrentDocumentLabel() || 'blm-document'}.zip`;
    const response = await api.exportBundle(S.currentFile);
    if (!response.ok) {
      alert('导出文档包失败，请稍后重试。');
      return;
    }
    const bundleBlob = await response.blob();
    App._downloadBlob(bundleBlob, bundleBlob.type || 'application/zip', bundleName);
  },

  cmdManual() {
    navigate('manual', {});
  },

  async cmdMerge() {
    resetMergeState();
    const files = await loadWorkspaceDocumentNames();
    if (!files) return;
    S.merge.workspaceFiles = files;
    if (S.merge.workspaceFiles.length < 2) {
      alert('至少需要两个工作区文档才能执行合并。');
      return;
    }
    syncMergeWorkspaceUi();
    const defaultLeft = (S.currentFile && S.merge.workspaceFiles.includes(S.currentFile))
      ? S.currentFile
      : S.merge.workspaceFiles[0];
    const defaultRight = S.merge.workspaceFiles.find((name) => name !== defaultLeft) || '';
    await App.selectMergeWorkspace('left', defaultLeft);
    await App.selectMergeWorkspace('right', defaultRight);
    clearMergeAnalysisState();
    openModalById('merge-modal-overlay');
  },

  closeMergeModal() {
    closeModalById('merge-modal-overlay');
  },

  clearMergeSource(kind) {
    setMergeSource(kind, { workspaceName: '', label: '', document: null });
  },

  async selectMergeWorkspace(kind, fileName) {
    const normalized = String(fileName || '').trim();
    if (!normalized) {
      App.clearMergeSource(kind);
      return;
    }
    const otherKind = kind === 'left' ? 'right' : 'left';
    if (S.merge.workspaceNames?.[otherKind] === normalized) {
      alert('同一个工作区文档不能同时放在左侧和右侧');
      syncMergeWorkspaceUi();
      return;
    }
    const document = await api.load(normalized);
    if (document.error) {
      syncMergeWorkspaceUi();
      return alert(document.error);
    }
    setMergeSource(kind, {
      workspaceName: normalized,
      label: normalized,
      document,
    });
  },

  async analyzeMerge() {
    const leftName = getMergeSelectedName('left');
    const rightName = getMergeSelectedName('right');
    if (!leftName || !rightName) {
      alert('请先选择左右两个工作区文档');
      return;
    }
    if (leftName === rightName) {
      alert('左右侧文档不能是同一个');
      return;
    }
    const payload = await ensureMergeWorkspaceDocuments();
    if (payload.error) return alert(payload.error);
    const result = await api.analyzeMerge(payload);
    if (result.error) return alert(result.error);
    S.merge.analysis = result;
    S.merge.resolutions = {};
    renderMergeAnalysis(result);
    return result;
  },

  async confirmMerge() {
    const analysis = S.merge.analysis || await App.analyzeMerge();
    if (!analysis) return;

    const conflicts = analysis.conflicts || [];
    if (conflicts.length) {
      const resolutions = collectMergeResolutions(conflicts);
      const unresolvedCount = conflicts.filter((conflict) => !resolutions[conflict.id]).length;
      if (unresolvedCount) {
        alert('请先处理所有冲突项，再确认合并。');
        return;
      }
    }
    await App.useMergeResult();
  },

  async useMergeResult() {
    if (!S.merge.analysis) {
      alert('请先执行合并分析');
      return;
    }
    const conflicts = S.merge.analysis.conflicts || [];
    const resolutions = collectMergeResolutions(conflicts);
    let result = S.merge.analysis;
    if (conflicts.length) {
      const payload = await ensureMergeWorkspaceDocuments();
      if (payload.error) return alert(payload.error);
      result = await api.applyMerge({
        ...payload,
        resolutions,
      });
      if (result.error) return alert(result.error);
      if ((result.conflicts || []).length) {
        S.merge.analysis = result;
        renderMergeAnalysis(result);
        alert('仍有未处理冲突，请逐项选择处理方式。');
        return;
      }
    }

    const nextName = getMergeSaveName(result);
    result.merged_document.meta = result.merged_document.meta || {};
    result.merged_document.meta.title = nextName;
    result.merged_document.meta.domain = nextName;
    const saveResult = await saveWorkspaceDocument(nextName, result.merged_document);
    if (!saveResult) return;
    setActiveDocumentSession(saveResult.document, { fileName: saveResult.name || nextName });
    App.closeMergeModal();
  },
};

function createDocUiState(doc) {
  const firstRoleId = getFirstRoleId(doc);
  const firstStageId = getStageItems(doc)[0]?.id || null;
  return {
    tab: 'domain',
    procId: doc.processes?.[0]?.id || null,
    taskId: null,
    stageId: firstStageId,
    stageViewMode: 'panorama',
    entityId: null,
    dataView: 'relation',
    stateFieldName: '',
    roleId: firstRoleId,
    roleQuery: '',
    sbCollapse: _defaultSbCollapse(doc),
    sidebarCollapsed: false,
    sidebarW: getUiPrefNumber('sidebarW', 240),
    procView: 'card',
    nodePerspective: 'user',
    procPrototypeExpanded: {},
    procRolePickerCollapsed: {},
    procEditorFocusSelector: '',
    procDiagramH: getUiPrefNumber('procDiagramH', 200),
    procDrawerW: getUiPrefNumber('procDrawerW', 480),
    stageGraphZoom: 1,
    entityDrawerW: getUiPrefNumber('entityDrawerW', 620),
    stateDiagramZoom: 1,
    stateEditorCollapsed: false,
  };
}

document.addEventListener('keydown', (event) => {
  const key = String(event.key || '').toLowerCase();
  if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 's') {
    event.preventDefault();
    App.cmdSave();
  }
});

bindBeforeUnloadWarning();
document.addEventListener('DOMContentLoaded', async () => {
  refreshSaveDialogText();
  render();
});

window.App = App;
window.toggleMergeCustomInput = toggleMergeCustomInput;
