'use strict';

const MANUAL_RUNTIME_ERROR = '当前服务版本过旧，请重启 BLM 服务后再打开使用手册。';
const MANUAL_DOC_ID = 'user-manual';

function buildDocsAssetUrl(relativePath) {
  return `/api/docs/assets/${String(relativePath || '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')}`;
}

function slugifyManualAnchor(value, fallback = 'section') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function rewriteManualRelativeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:|mailto:|#|\/)/i.test(raw)) return raw;
  return buildDocsAssetUrl(raw);
}

function buildManualRenderedState(docId, markdown) {
  const rawHtml = window.markedLib
    ? window.markedLib.parse(markdown || '')
    : `<pre>${esc(markdown || '')}</pre>`;
  const host = document.createElement('div');
  host.innerHTML = rawHtml;

  const outline = [];
  const images = [];

  host.querySelectorAll('h1, h2, h3, h4').forEach((heading, index) => {
    const label = String(heading.textContent || '').trim();
    const id = `manual-${slugifyManualAnchor(`${docId}-${label}-${index}`, 'section')}`;
    heading.id = id;
    outline.push({
      id,
      label: label || `章节 ${index + 1}`,
      depth: Math.max(Number(heading.tagName.slice(1)) - 1, 0),
    });
  });

  host.querySelectorAll('pre > code.language-mermaid').forEach((codeBlock, index) => {
    const pre = codeBlock.parentElement;
    if (!pre) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'manual-mermaid';
    wrapper.setAttribute(
      'data-manual-mermaid',
      encodeURIComponent(String(codeBlock.textContent || '').trim()),
    );
    wrapper.id = `manual-mermaid-${docId}-${index + 1}`;
    pre.replaceWith(wrapper);
  });

  host.querySelectorAll('img').forEach((image, index) => {
    const figureId = `manual-image-${docId}-${index + 1}`;
    const alt = String(image.getAttribute('alt') || '').trim() || `图示 ${index + 1}`;
    const resolvedSrc = rewriteManualRelativeUrl(image.getAttribute('src'));
    image.setAttribute('src', resolvedSrc);
    image.setAttribute('alt', alt);
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');

    let figure = image.closest('figure');
    if (!figure) {
      figure = document.createElement('figure');
      image.replaceWith(figure);
      figure.appendChild(image);
    }
    figure.classList.add('manual-figure');
    figure.id = figureId;

    let caption = figure.querySelector('figcaption');
    if (!caption && alt) {
      caption = document.createElement('figcaption');
      caption.textContent = alt;
      figure.appendChild(caption);
    }

    images.push({
      id: figureId,
      label: alt,
      src: resolvedSrc,
    });
  });

  host.querySelectorAll('a[href]').forEach((link) => {
    const href = String(link.getAttribute('href') || '').trim();
    if (!href) return;
    link.setAttribute('href', rewriteManualRelativeUrl(href));
    if (/^https?:/i.test(href)) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });

  return {
    html: host.innerHTML,
    outline,
    images,
  };
}

function renderManualMermaid() {
  const blocks = document.querySelectorAll('.manual-mermaid[data-manual-mermaid]');
  blocks.forEach(async (block) => {
    const encoded = block.getAttribute('data-manual-mermaid') || '';
    const code = decodeURIComponent(encoded);
    if (!code) return;
    if (!window.mermaidLib) {
      block.innerHTML = `<pre class="md-code">${esc(code)}</pre>`;
      return;
    }
    try {
      const { svg } = await window.mermaidLib.render(
        `manual-mermaid-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        code,
      );
      block.innerHTML = svg;
    } catch (_) {
      block.innerHTML = `<pre class="md-code">${esc(code)}</pre>`;
    }
  });
}

function manualJumpTo(anchorId) {
  const target = document.getElementById(anchorId);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildManualOutlineGroups() {
  const groups = [];
  let currentGroup = null;
  let fallbackGroupIndex = 0;

  for (const item of (S.manual.outline || [])) {
    if (!item || !item.id) continue;
    if (item.depth <= 0) continue;
    if (item.depth === 1) {
      currentGroup = {
        id: item.id,
        label: item.label,
        children: [],
      };
      groups.push(currentGroup);
      continue;
    }
    if (!currentGroup) {
      currentGroup = {
        id: `manual-outline-group-${fallbackGroupIndex += 1}`,
        label: '核心功能',
        children: [],
      };
      groups.push(currentGroup);
    }
    currentGroup.children.push({
      ...item,
      depth: item.depth - 1,
    });
  }

  return groups;
}

function isManualOutlineGroupCollapsed(groupId) {
  return S.manual.collapsedGroups?.[groupId] !== false;
}

function toggleManualOutlineGroup(groupId) {
  if (!groupId) return;
  if (!S.manual.collapsedGroups) S.manual.collapsedGroups = {};
  S.manual.collapsedGroups[groupId] = !isManualOutlineGroupCollapsed(groupId);
  if (S.ui.tab === 'manual') renderManualTab();
}

function renderManualOutlineList() {
  if (S.manual.error) {
    return `<div class="manual-empty-hint manual-error-hint">${esc(S.manual.error)}</div>`;
  }
  if (S.manual.loading) {
    return '<div class="manual-empty-hint">正在生成目录...</div>';
  }
  const groups = buildManualOutlineGroups();
  if (!groups.length) {
    return '<div class="manual-empty-hint">当前文档暂无目录项。</div>';
  }
  return groups.map((group) => {
    const collapsed = isManualOutlineGroupCollapsed(group.id);
    const childrenHtml = group.children.map((item) => `
      <button
        type="button"
        class="manual-outline-link depth-${Math.min(item.depth + 1, 3)}"
        onclick="manualJumpTo('${esc(item.id)}')"
      >${esc(item.label)}</button>`).join('');
    return `
      <div class="manual-outline-group">
        <div class="manual-outline-group-head">
          <button
            type="button"
            class="manual-outline-toggle"
            onclick="toggleManualOutlineGroup('${esc(group.id)}')"
            aria-label="${collapsed ? '展开目录' : '折叠目录'}"
          >${collapsed ? '▸' : '▾'}</button>
          <button
            type="button"
            class="manual-outline-link depth-1 group-link"
            onclick="manualJumpTo('${esc(group.id)}')"
          >${esc(group.label)}</button>
        </div>
        <div class="manual-outline-children ${collapsed ? 'collapsed' : ''}">
          ${childrenHtml}
        </div>
      </div>`;
  }).join('');
}

function renderManualTab() {
  const container = document.getElementById('tab-content');
  if (!container) return;
  const title = S.manual.activeTitle || '用户手册';
  const contentHtml = S.manual.loading
    ? '<div class="manual-loading">正在加载文档内容...</div>'
    : (S.manual.error
      ? `<div class="manual-loading manual-error-hint">${esc(S.manual.error)}</div>`
      : (S.manual.html || '<div class="manual-loading">正在准备文档内容...</div>'));

  container.innerHTML = `
    <div class="manual-wrap" data-testid="manual-tab">
      <div class="manual-body">
        <aside class="manual-nav">
          <section class="manual-panel">
            <div class="manual-panel-title">目录</div>
            <div class="manual-outline-list">${renderManualOutlineList()}</div>
          </section>
        </aside>
        <section class="manual-reader">
          <div class="manual-reader-head">
            <h2 id="manual-current-title" data-testid="manual-title">${esc(title)}</h2>
          </div>
          <article id="manual-content" class="manual-article">${contentHtml}</article>
        </section>
      </div>
    </div>`;

  if (!S.manual.loading && S.manual.html) {
    requestAnimationFrame(() => {
      if (S.ui.tab !== 'manual') return;
      renderManualMermaid();
    });
  }
}

async function ensureManualDocsLoaded() {
  if (S.runtime.checked && !S.runtime.supportsDocs) {
    S.manual.error = MANUAL_RUNTIME_ERROR;
    return false;
  }
  S.manual.loading = true;
  if (S.ui.tab === 'manual') renderManualTab();
  if (!S.runtime.checked) {
    const runtime = await api.runtime();
    S.runtime.checked = true;
    S.runtime.apiVersion = Number(runtime?.api_version || 0);
    S.runtime.supportsDocs = !!runtime?.supports_docs;
    if (!S.runtime.supportsDocs) {
      S.manual.loading = false;
      S.manual.error = MANUAL_RUNTIME_ERROR;
      if (S.ui.tab === 'manual') renderManualTab();
      return false;
    }
  }
  return true;
}

async function openManualDoc(docId) {
  const normalizedId = String(docId || MANUAL_DOC_ID).trim() || MANUAL_DOC_ID;
  S.manual.activeDocId = normalizedId;
  S.manual.loading = true;
  if (S.ui.tab === 'manual') renderManualTab();
  const result = await api.doc(normalizedId);
  if (result.error) {
    S.manual.loading = false;
    S.manual.error = result.error === 'not found' ? MANUAL_RUNTIME_ERROR : result.error;
    if (S.ui.tab === 'manual') renderManualTab();
    return;
  }

  const rendered = buildManualRenderedState(normalizedId, result.content || '');
  S.manual.activeDocId = result.id || normalizedId;
  S.manual.activeTitle = result.title || '用户手册';
  S.manual.activeSummary = result.summary || '';
  S.manual.html = rendered.html;
  S.manual.outline = rendered.outline;
  S.manual.images = rendered.images;
  S.manual.collapsedGroups = {};
  S.manual.loading = false;
  S.manual.error = '';
  if (S.ui.tab === 'manual') renderManualTab();
}

async function bootManualTab() {
  const runtimeReady = await ensureManualDocsLoaded();
  if (!runtimeReady) {
    S.manual.loading = false;
    if (S.ui.tab === 'manual') renderManualTab();
    return;
  }
  S.manual.activeDocId = MANUAL_DOC_ID;
  if (S.manual.activeDocId === MANUAL_DOC_ID && S.manual.html) {
    if (S.ui.tab === 'manual') renderManualTab();
    return;
  }
  await openManualDoc(MANUAL_DOC_ID);
}

window.renderManualTab = renderManualTab;
window.bootManualTab = bootManualTab;
window.openManualDoc = openManualDoc;
window.manualJumpTo = manualJumpTo;
window.toggleManualOutlineGroup = toggleManualOutlineGroup;
