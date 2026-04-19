'use strict';

function setDomain(val) {
  if(!S.doc) return;
  S.doc.meta.domain = val;
  S.doc.meta.title  = val;   // title mirrors domain
  markModified();
  document.getElementById('file-name').textContent = val || '未命名';
}

function setMeta(key, val) { if(S.doc){S.doc.meta[key]=val; markModified();} }

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Roles
═══════════════════════════════════════════════════════════ */
function addRole() {
  const inp = document.getElementById('role-input');
  const role = (inp?.value||'').trim();
  if(!role) return;
  if(!S.doc.roles) S.doc.roles=[];
  if(!S.doc.roles.includes(role)){S.doc.roles.push(role); markModified(); render();}
  if(inp) inp.value='';
}
function removeRole(idx) { S.doc.roles.splice(idx,1); markModified(); render(); }

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Language
═══════════════════════════════════════════════════════════ */
function addTerm()            { S.doc.language.push({term:'',definition:''}); markModified(); render(); }
function removeTerm(idx)      { S.doc.language.splice(idx,1); markModified(); render(); }
function setTerm(idx,k,val)   { S.doc.language[idx][k]=val; markModified(); }


function renderDomainTab() {
  ensureProcPos(S.doc);
  const m=S.doc.meta||{};
  const roles=S.doc.roles||[];
  const lang=S.doc.language||[];
  let h='<div class="domain-scroll">';

  /* ── 紧凑信息栏：业务域 / 角色 / 统一语言 三行合一卡片 ── */
  const langCollapsed = S.ui.sbCollapse['lang'] !== false; /* 默认折叠 */
  h+=`<div class="ctx-card domain-info-bar">
    <div class="info-bar-row">
      <span class="info-bar-label">业务域名称</span>
      <input type="text" style="flex:1" value="${esc(m.domain||m.title||'')}"
        oninput="setDomain(this.value)" placeholder="如：仓储管理 v2、采购">
      <span class="info-bar-label" style="margin-left:12px">日期</span>
      <input type="text" style="width:100px" value="${esc(m.date||'')}"
        oninput="setMeta('date',this.value)" placeholder="2025-01">
    </div>
    <div class="info-bar-row">
      <span class="info-bar-label">参与角色</span>
      <div class="role-tag-list" style="flex:1;flex-wrap:wrap;margin:0">`;
  roles.forEach((r,i)=>{
    h+=`<span class="role-tag">${esc(r)}<button class="role-del" onclick="removeRole(${i})">×</button></span>`;
  });
  h+=`</div>
      <input type="text" id="role-input" style="width:110px" placeholder="输入角色名"
        onkeydown="if(event.key==='Enter')addRole()">
      <button class="btn btn-outline btn-sm" onclick="addRole()">添加</button>
    </div>
    <div class="info-bar-row info-bar-lang" onclick="toggleDomainSection('lang')" style="cursor:pointer">
      <span class="info-bar-label">统一语言</span>
      <span class="lang-collapse-btn">${langCollapsed?'▶':'▾'}</span>
      ${langCollapsed&&lang.length?`<span class="lang-summary">共 ${lang.length} 条术语，点击展开</span>`:''}
      ${langCollapsed&&!lang.length?`<span class="lang-summary">暂无术语，点击展开添加</span>`:''}
      <span style="flex:1"></span>
      ${!langCollapsed?`<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();addTerm()">＋ 添加术语</button>`:''}
    </div>
  </div>`;

  if(!langCollapsed) {
    h+=`<div class="ctx-card" style="margin-top:-12px;border-top-left-radius:0;border-top-right-radius:0">`;
    if(lang.length){
      h+=`<table class="term-table">
        <thead><tr><th>术语</th><th>定义</th><th></th></tr></thead><tbody>`;
      lang.forEach((t,i)=>{
        h+=`<tr>
          <td><input type="text" value="${esc(t.term||'')}"
            oninput="setTerm(${i},'term',this.value)" placeholder="术语"></td>
          <td><input type="text" value="${esc(t.definition||'')}"
            oninput="setTerm(${i},'definition',this.value)" placeholder="定义"></td>
          <td><button class="field-del" onclick="removeTerm(${i})">✕</button></td>
        </tr>`;
      });
      h+=`</tbody></table>`;
    } else {
      h+=`<p class="no-refs">暂无术语定义</p>`;
    }
    h+=`</div>`;
  }

  h+=`</div>`; /* end domain-scroll */

  document.getElementById('tab-content').innerHTML=h;
}
