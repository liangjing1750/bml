'use strict';

/* ═══════════════════════════════════════════════════════════
   COMMANDS
═══════════════════════════════════════════════════════════ */
const App = {
  cmdNew() {
    document.getElementById('new-doc-name').value='';
    document.getElementById('modal-overlay').classList.remove('hidden');
    setTimeout(()=>document.getElementById('new-doc-name')?.focus(),50);
  },
  closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); },
  async confirmNew() {
    const name=document.getElementById('new-doc-name').value.trim();
    if(!name) return alert('请输入名称');
    const res=await api.create(name); if(res.error) return alert(res.error);
    App.closeModal();
    const doc=await api.load(name);
    S.currentFile=name; S.doc=doc; S.modified=false;
    S.ui={tab:'domain', procId:doc.processes?.[0]?.id||null, taskId:null, entityId:null, sbCollapse:_defaultSbCollapse(doc), sidebarCollapsed:false};
    render();
  },

  async cmdOpen() {
    const files=await api.files();
    const fl=document.getElementById('file-list');
    fl.innerHTML=files.length
      ? files.map(f=>`
          <div class="file-list-item" onclick="App.openFile('${esc(f)}')">
            <span class="file-list-item-name">${esc(f)}</span>
            <button class="file-list-item-del"
              onclick="event.stopPropagation();App.deleteFile('${esc(f)}')" title="删除">✕</button>
          </div>`).join('')
      : `<div class="file-empty">暂无文档</div>`;
    document.getElementById('open-modal-overlay').classList.remove('hidden');
  },
  closeOpenModal() { document.getElementById('open-modal-overlay').classList.add('hidden'); },
  async openFile(name) {
    App.closeOpenModal();
    const doc=await api.load(name);
    /* 若 domain 为空，同步为文件名，避免保存时误触发重命名 */
    if(doc.meta && !doc.meta.domain) doc.meta.domain = name;
    S.currentFile=name; S.doc=doc; S.modified=false;
    S.ui={tab:'domain', procId:doc.processes?.[0]?.id||null, taskId:null, entityId:null, sbCollapse:_defaultSbCollapse(doc), sidebarCollapsed:false};
    render();
  },
  async deleteFile(name) {
    if(!confirm(`确认删除"${name}"？`)) return;
    await api.del(name);
    if(S.currentFile===name){S.currentFile=null;S.doc=null;S.modified=false;render();}
    await App.cmdOpen();
  },

  async cmdSave() {
    if(!S.doc||!S.currentFile) return;
    const newDomain=(S.doc.meta?.domain||'').trim();
    if(newDomain && newDomain!==S.currentFile) {
      /* 业务域改名 → 先存新文件，确认后再删旧文件 */
      await api.save(newDomain, S.doc);
      if(confirm(`文档将另存为"${newDomain}"，是否同时删除旧文件"${S.currentFile}"？`)) {
        await api.del(S.currentFile);
      }
      S.currentFile=newDomain;
    } else {
      await api.save(S.currentFile, S.doc);
    }
    S.modified=false;
    document.getElementById('modified-dot')?.classList.add('hidden');
    renderToolbar();
    if(S.ui.tab==='domain') renderDomainTab();
  },

  async cmdExport() {
    if(!S.currentFile) return;
    await App.cmdSave();
    const md=await api.exportMd(S.currentFile);
    const blob=new Blob([md],{type:'text/plain;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`${S.currentFile}.md`;
    a.click();
  }
};

/* ═══════════════════════════════════════════════════════════
   KEYBOARD
═══════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();App.cmdSave();}
});

document.addEventListener('DOMContentLoaded', ()=>render());

window.App = App;
