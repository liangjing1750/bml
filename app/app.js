'use strict';

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
    document.getElementById('new-doc-name').value = '';
    document.getElementById('modal-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('new-doc-name')?.focus(), 50);
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  },

  async confirmNew() {
    const name = document.getElementById('new-doc-name').value.trim();
    if (!name) return alert('请输入名称');

    const res = await api.create(name);
    if (res.error) return alert(res.error);

    App.closeModal();
    const doc = await api.load(name);
    S.currentFile = name;
    S.doc = doc;
    S.modified = false;
    S.ui = createDocUiState(doc);
    render();
  },

  async cmdOpen() {
    const files = await api.files();
    const fileList = document.getElementById('file-list');
    fileList.innerHTML = files.length
      ? files.map((fileName) => `
          <div class="file-list-item" onclick="App.openFile('${esc(fileName)}')">
            <span class="file-list-item-name">${esc(fileName)}</span>
            <button class="file-list-item-del"
              onclick="event.stopPropagation();App.deleteFile('${esc(fileName)}')" title="删除">×</button>
          </div>`).join('')
      : '<div class="file-empty">暂无文档。</div>';
    document.getElementById('open-modal-overlay').classList.remove('hidden');
  },

  closeOpenModal() {
    document.getElementById('open-modal-overlay').classList.add('hidden');
  },

  cmdSaveAs() {
    if (!S.doc) return;
    const input = document.getElementById('save-as-name');
    if (input) {
      input.value = (S.doc.meta?.domain || S.currentFile || '').trim();
    }
    document.getElementById('save-as-modal-overlay').classList.remove('hidden');
    setTimeout(() => input?.focus(), 50);
  },

  closeSaveAsModal() {
    document.getElementById('save-as-modal-overlay').classList.add('hidden');
  },

  async openFile(name) {
    App.closeOpenModal();
    const doc = await api.load(name);
    if (doc.meta && !doc.meta.domain) doc.meta.domain = name;
    S.currentFile = name;
    S.doc = doc;
    S.modified = false;
    S.ui = createDocUiState(doc);
    render();
  },

  async deleteFile(name) {
    if (!confirm(`确认删除"${name}"？`)) return;
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
    if (!S.doc || !S.currentFile) return;
    await api.save(S.currentFile, S.doc);

    S.modified = false;
    renderToolbar();
    if (S.ui.tab === 'domain') renderDomainTab();
  },

  async confirmSaveAs() {
    if (!S.doc) return;
    const name = document.getElementById('save-as-name').value.trim();
    if (!name) return alert('请输入业务域名称');

    S.doc.meta = S.doc.meta || {};
    S.doc.meta.domain = name;
    S.doc.meta.title = name;
    S.currentFile = name;
    await api.save(name, S.doc);

    S.modified = false;
    App.closeSaveAsModal();
    renderToolbar();
    if (S.ui.tab === 'domain') renderDomainTab();
  },

  async cmdExport() {
    if (!S.currentFile) return;
    await App.cmdSave();
    const [document, md] = await Promise.all([
      api.exportJson(S.currentFile),
      api.exportMd(S.currentFile),
    ]);
    App._downloadBlob(
      `${JSON.stringify(document, null, 2)}\n`,
      'application/json;charset=utf-8',
      `${S.currentFile}.json`,
    );
    App._downloadBlob(md, 'text/plain;charset=utf-8', `${S.currentFile}.md`);
  },
};

function createDocUiState(doc) {
  const firstRoleId = Array.isArray(doc.roles) && doc.roles.length && typeof doc.roles[0] === 'object'
    ? doc.roles[0].id
    : null;
  return {
    tab: 'domain',
    procId: doc.processes?.[0]?.id || null,
    taskId: null,
    entityId: null,
    dataView: 'relation',
    stateFieldName: '',
    roleId: firstRoleId,
    roleQuery: '',
    sbCollapse: _defaultSbCollapse(doc),
    sidebarCollapsed: false,
    sidebarW: getUiPrefNumber('sidebarW', 240),
    procView: 'card',
    procDrawerW: getUiPrefNumber('procDrawerW', 480),
    entityDrawerW: getUiPrefNumber('entityDrawerW', 480),
  };
}

document.addEventListener('keydown', (event) => {
  const key = String(event.key || '').toLowerCase();
  if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 's') {
    event.preventDefault();
    App.cmdSave();
  }
});

document.addEventListener('DOMContentLoaded', () => render());

window.App = App;
