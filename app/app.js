'use strict';

const App = {
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

    const newDomain = (S.doc.meta?.domain || '').trim();
    if (newDomain && newDomain !== S.currentFile) {
      await api.save(newDomain, S.doc);
      if (confirm(`文档将另存为"${newDomain}"，是否同时删除旧文件"${S.currentFile}"？`)) {
        await api.del(S.currentFile);
      }
      S.currentFile = newDomain;
    } else {
      await api.save(S.currentFile, S.doc);
    }

    S.modified = false;
    document.getElementById('modified-dot')?.classList.add('hidden');
    renderToolbar();
    if (S.ui.tab === 'domain') renderDomainTab();
  },

  async cmdExport() {
    if (!S.currentFile) return;
    await App.cmdSave();
    const md = await api.exportMd(S.currentFile);
    const blob = new Blob([md], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${S.currentFile}.md`;
    link.click();
  },
};

function createDocUiState(doc) {
  return {
    tab: 'domain',
    procId: doc.processes?.[0]?.id || null,
    taskId: null,
    entityId: null,
    sbCollapse: _defaultSbCollapse(doc),
    sidebarCollapsed: false,
    procView: 'list',
  };
}

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    App.cmdSave();
  }
});

document.addEventListener('DOMContentLoaded', () => render());

window.App = App;
