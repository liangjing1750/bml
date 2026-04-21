'use strict';

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

function renderManualDocList() {
  const docs = S.manual.docs || [];
  if (!docs.length) {
    return '<div class="manual-empty-hint">还没有可展示的文档。</div>';
  }
  return docs.map((doc) => `
    <button
      type="button"
      class="manual-doc-button ${S.manual.activeDocId === doc.id ? 'active' : ''}"
      data-testid="manual-doc-${doc.id}"
      onclick="openManualDoc('${esc(doc.id)}')"
    >
      <span class="manual-doc-button-title">${esc(doc.title || '')}</span>
      <span class="manual-doc-button-summary">${esc(doc.summary || '')}</span>
    </button>`).join('');
}

function renderManualOutlineList() {
  if (S.manual.loading) {
    return '<div class="manual-empty-hint">正在生成目录…</div>';
  }
  const outline = S.manual.outline || [];
  if (!outline.length) {
    return '<div class="manual-empty-hint">当前文档暂无目录项。</div>';
  }
  return outline.map((item) => `
    <button
      type="button"
      class="manual-outline-link depth-${item.depth}"
      onclick="manualJumpTo('${esc(item.id)}')"
    >${esc(item.label)}</button>`).join('');
}

function renderManualImageRail() {
  if (S.manual.loading) {
    return '<div class="manual-empty-hint">正在加载图示…</div>';
  }
  const images = S.manual.images || [];
  if (!images.length) {
    return '<div class="manual-empty-hint">当前文档没有截图。</div>';
  }
  return images.map((image) => `
    <button type="button" class="manual-image-card" onclick="manualJumpTo('${esc(image.id)}')">
      <img src="${esc(image.src)}" alt="${esc(image.label)}">
      <span>${esc(image.label)}</span>
    </button>`).join('');
}

function renderManualTab() {
  const container = document.getElementById('tab-content');
  if (!container) return;
  const title = S.manual.activeTitle || '使用手册';
  const summary = S.manual.activeSummary || '在这里可以查看设计文档、测试用例和用户手册。';
  const contentHtml = S.manual.loading
    ? '<div class="manual-loading">正在加载文档内容…</div>'
    : (S.manual.html || '<div class="manual-loading">正在准备文档内容…</div>');

  container.innerHTML = `
    <div class="manual-wrap" data-testid="manual-tab">
      <div class="manual-header">
        <div>
          <div class="manual-eyebrow">使用手册</div>
          <h2 id="manual-current-title" data-testid="manual-title">${esc(title)}</h2>
          <p>${esc(summary)}</p>
        </div>
      </div>
      <div class="manual-body">
        <aside class="manual-nav">
          <section class="manual-panel">
            <div class="manual-panel-title">文档列表</div>
            <div class="manual-doc-list">${renderManualDocList()}</div>
          </section>
          <section class="manual-panel">
            <div class="manual-panel-title">目录大纲</div>
            <div class="manual-outline-list">${renderManualOutlineList()}</div>
          </section>
        </aside>
        <section class="manual-reader">
          <article id="manual-content" class="manual-article">${contentHtml}</article>
        </section>
        <aside class="manual-rail">
          <section class="manual-panel manual-panel-sticky">
            <div class="manual-panel-title">图示速览</div>
            <div class="manual-image-list">${renderManualImageRail()}</div>
          </section>
        </aside>
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
  if ((S.manual.docs || []).length) return S.manual.docs;
  S.manual.loading = true;
  if (S.ui.tab === 'manual') renderManualTab();
  const docs = await api.docs();
  if (docs.error) {
    S.manual.loading = false;
    if (S.ui.tab === 'manual') renderManualTab();
    alert(docs.error);
    return [];
  }
  S.manual.docs = Array.isArray(docs) ? docs : [];
  if (!S.manual.activeDocId && S.manual.docs.length) {
    S.manual.activeDocId = S.manual.docs[0].id;
  }
  return S.manual.docs;
}

async function openManualDoc(docId) {
  const normalizedId = String(docId || '').trim();
  if (!normalizedId) return;
  S.manual.activeDocId = normalizedId;
  S.manual.loading = true;
  if (S.ui.tab === 'manual') renderManualTab();
  const result = await api.doc(normalizedId);
  if (result.error) {
    S.manual.loading = false;
    if (S.ui.tab === 'manual') renderManualTab();
    return alert(result.error);
  }

  const rendered = buildManualRenderedState(normalizedId, result.content || '');
  S.manual.activeDocId = result.id || normalizedId;
  S.manual.activeTitle = result.title || '';
  S.manual.activeSummary = result.summary || '';
  S.manual.html = rendered.html;
  S.manual.outline = rendered.outline;
  S.manual.images = rendered.images;
  S.manual.loading = false;
  if (S.ui.tab === 'manual') renderManualTab();
}

async function bootManualTab() {
  const docs = await ensureManualDocsLoaded();
  if (!docs.length) {
    S.manual.loading = false;
    if (S.ui.tab === 'manual') renderManualTab();
    return;
  }
  if (!S.manual.activeDocId) {
    S.manual.activeDocId = docs[0].id;
  }
  if (S.manual.activeDocId && S.manual.html) {
    if (S.ui.tab === 'manual') renderManualTab();
    return;
  }
  await openManualDoc(S.manual.activeDocId || docs[0].id);
}

window.renderManualTab = renderManualTab;
window.bootManualTab = bootManualTab;
window.openManualDoc = openManualDoc;
window.manualJumpTo = manualJumpTo;
