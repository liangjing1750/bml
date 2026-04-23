const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

function buildProcessEditorDoc(name) {
  return {
    meta: {
      title: name,
      domain: name,
      author: '',
      date: '2026-04',
    },
    roles: [
      { id: 'R1', name: '用户', desc: '' },
      { id: 'R2', name: '审核员', desc: '' },
      { id: 'R3', name: '运营专员', desc: '' },
    ],
    language: [],
    processes: [
      {
        id: 'P1',
        name: '统一登录',
        subDomain: '用户管理',
        flowGroup: '',
        trigger: '',
        outcome: '',
        tasks: [
          {
            id: 'T1',
            name: '登录校验',
            role_id: 'R1',
            steps: [
              { name: '选择认证方式', type: 'Query', note: '展示认证入口' },
              { name: '输入账号密码', type: 'Input', note: '录入登录凭证' },
            ],
            orchestrationTasks: [
              { name: '校验账号状态', type: 'Check', querySourceKind: '', target: '认证服务', note: '冻结账号不可继续' },
              { name: '生成登录会话', type: 'Service', querySourceKind: '', target: '会话服务', note: '写入登录态' },
            ],
          },
          {
            id: 'T2',
            name: '生成首页上下文',
            role_id: 'R1',
            steps: [
              { name: '查看工作台', type: 'View', note: '进入首页后展示默认工作台' },
            ],
            orchestrationTasks: [
              { name: '加载首页菜单', type: 'Query', querySourceKind: 'QueryService', target: '门户服务', note: '返回角色菜单和快捷入口' },
            ],
          },
        ],
      },
    ],
    entities: [],
    relations: [],
    rules: [],
  };
}

async function openTaskEditor(page, name) {
  await page.goto('/');
  await openDocument(page, name);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-overview').click();
  await page.locator('.ovc-body').first().click();
  await page.locator('#proc-diagram .pf-task[data-id="T1"]').click();
  await expect(page.locator('.proc-drawer .drawer-crumb').first()).toContainText('登录校验');
}

test('节点在当前编辑区内展示编排任务与任务级流程图', async ({ page, request }) => {
  const documentName = `process-orchestration-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);
  await expect(page.getByTestId('node-perspective-switch')).toBeVisible();
  await page.getByTestId('node-perspective-engineering').click();
  await expect(page.locator('.node-perspective-btn.active')).toContainText('任务级视图');
  await expect(page.getByTestId('orchestration-section')).toBeVisible();
  await expect(page.getByTestId('user-steps-section')).toHaveCount(0);
   await expect(page.getByTestId('global-orchestration-flow')).toBeVisible();
  await expect(page.getByTestId('orchestration-flow')).toBeVisible();
  await expect(page.locator('.proc-subdrawer')).toHaveCount(0);
  await expect(page.locator('.orch-card .orch-name').first()).toHaveValue('校验账号状态');
  await expect(page.locator('.orch-card input[type="text"]').nth(1)).toHaveValue('认证服务');
  await expect(page.locator('.ptf-node-frame')).toHaveCount(2);
  await expect(page.locator('.ptf-node-frame').first()).toContainText('登录校验');
  await expect(page.locator('.ptf-node-frame').nth(1)).toContainText('生成首页上下文');
});

test('任务级视图切回用户步骤视图后步骤区不重复插入操作按钮', async ({ page, request }) => {
  const documentName = `process-toggle-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);
  await page.getByTestId('node-perspective-engineering').click();
  await page.getByTestId('node-perspective-user').click();

  const stepRows = page.locator('.step-row');
  await expect(stepRows).toHaveCount(2);
  await expect(page.getByTestId('user-steps-section')).toBeVisible();
  await expect(page.locator('.step-row .step-actions')).toHaveCount(2);

  const actionsPerRow = await page.locator('.step-row').evaluateAll((rows) =>
    rows.map((row) => row.querySelectorAll('.step-actions').length),
  );
  expect(actionsPerRow).toEqual([1, 1]);
});

test('任务级视图支持放大缩小和重置', async ({ page, request }) => {
  const documentName = `process-taskflow-zoom-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);
  await page.getByTestId('node-perspective-engineering').click();

  const taskFlow = page.locator('#proc-diagram .ptf-wrap');
  await expect(taskFlow).toBeVisible();

  const zoomButtons = page.locator('.drawer-diag.taskflow-mode .zoom-btn');
  await zoomButtons.nth(0).click();

  let zoomValue = await taskFlow.evaluate((node) => node.style.zoom);
  expect(zoomValue).toBe('1.2');

  await zoomButtons.nth(0).click();
  zoomValue = await taskFlow.evaluate((node) => node.style.zoom);
  expect(zoomValue).toBe('1.4');

  await zoomButtons.nth(2).click();
  zoomValue = await taskFlow.evaluate((node) => node.style.zoom);
  expect(zoomValue).toBe('1.2');

  await zoomButtons.nth(1).click();
  zoomValue = await taskFlow.evaluate((node) => node.style.zoom);
  expect(zoomValue).toBe('1');
});

test('用户操作步骤支持行内插入并可上下调整顺序', async ({ page, request }) => {
  const documentName = `process-steps-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);

  const firstStep = page.locator('.step-row').first();
  await firstStep.locator('.step-add-after').click();
  await expect(page.locator('.step-row')).toHaveCount(3);

  const insertedName = page.locator('.step-row').nth(1).locator('.step-name');
  await insertedName.fill('校验登录环境');

  let names = await page.locator('.step-name').evaluateAll((nodes) => nodes.map((node) => node.value));
  expect(names).toEqual(['选择认证方式', '校验登录环境', '输入账号密码']);

  await page.locator('.step-row').nth(1).locator('.step-move-down').click();
  names = await page.locator('.step-name').evaluateAll((nodes) => nodes.map((node) => node.value));
  expect(names).toEqual(['选择认证方式', '输入账号密码', '校验登录环境']);
});

test('节点角色支持多选且切换后保持编辑区位置', async ({ page, request }) => {
  const documentName = `process-multi-role-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.processes[0].tasks[0].steps = Array.from({ length: 16 }, (_, index) => ({
    name: `步骤${index + 1}`,
    type: 'Query',
    note: `说明${index + 1}`,
  }));

  await createDocument(request, documentName, doc);
  await openTaskEditor(page, documentName);

  const drawerBody = page.locator('.proc-drawer .drawer-body');
  const picker = page.getByTestId('task-role-picker');
  const toggle = page.getByTestId('task-role-toggle');
  const summary = page.getByTestId('task-role-summary');
  const pickerBody = page.getByTestId('task-role-picker-body');
  const secondRoleOption = page.locator('[data-task-role-id="R2"]').first();

  await expect(toggle).toContainText('展开角色');
  await expect(page.getByTestId('task-role-collapsed-preview')).toBeVisible();
  await expect(pickerBody).not.toBeVisible();

  const collapsedHeight = await picker.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  await summary.click();
  await expect(pickerBody).not.toBeVisible();
  await toggle.click();
  await expect(pickerBody).toBeVisible();
  await expect(toggle).toContainText('收起角色');
  const expandedHeight = await picker.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  expect(expandedHeight).toBeGreaterThan(collapsedHeight + 80);

  await drawerBody.evaluate((node) => { node.scrollTop = 72; });
  const beforeScrollTop = await drawerBody.evaluate((node) => node.scrollTop);
  const beforeRoleOptionTop = await secondRoleOption.evaluate((node) => {
    const drawerBodyNode = node.closest('.drawer-body');
    if (!drawerBodyNode) return node.getBoundingClientRect().top;
    return node.getBoundingClientRect().top - drawerBodyNode.getBoundingClientRect().top;
  });

  await page.getByTestId('task-role-checkbox').nth(1).check();
  await expect(page.locator('.task-role-selected-chip')).toHaveCount(2);
  const afterSecondRoleOptionTop = await secondRoleOption.evaluate((node) => {
    const drawerBodyNode = node.closest('.drawer-body');
    if (!drawerBodyNode) return node.getBoundingClientRect().top;
    return node.getBoundingClientRect().top - drawerBodyNode.getBoundingClientRect().top;
  });

  await page.getByTestId('task-role-checkbox').nth(2).check();
  await expect(page.locator('.task-role-selected-chip')).toHaveCount(3);

  const afterScrollTop = await drawerBody.evaluate((node) => node.scrollTop);
  await expect(picker).toContainText('已选 3 个角色');
  expect(Math.abs(afterScrollTop - beforeScrollTop)).toBeLessThanOrEqual(24);
  expect(Math.abs(afterSecondRoleOptionTop - beforeRoleOptionTop)).toBeLessThanOrEqual(4);

  const diagramRoles = await page.locator('#proc-diagram .pf-task[data-id="T1"] .pf-role-list').evaluate((node) => {
    const style = window.getComputedStyle(node);
    return {
      chips: Array.from(node.querySelectorAll('.pf-role-chip')).map((item) => item.textContent.trim()),
      flexWrap: style.flexWrap,
      justifyContent: style.justifyContent,
    };
  });
  expect(diagramRoles.chips).toEqual(['用户', '审核员', '运营专员']);
  expect(diagramRoles.flexWrap).toBe('wrap');
  expect(diagramRoles.justifyContent).toBe('center');

  await toggle.click();
  await expect(pickerBody).not.toBeVisible();
  await expect(toggle).toContainText('展开角色');
  const recollapsedHeight = await picker.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  expect(recollapsedHeight).toBeLessThan(expandedHeight - 80);
});

test('流程图区域支持拖拽增高且局部重绘后保持高度', async ({ page, request }) => {
  const documentName = `process-diagram-resize-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.processes[0].tasks[0].steps = Array.from({ length: 10 }, (_, index) => ({
    name: `步骤${index + 1}`,
    type: 'Query',
    note: `说明${index + 1}`,
  }));

  await createDocument(request, documentName, doc);
  await openTaskEditor(page, documentName);

  const diagram = page.locator('.proc-drawer .drawer-diag');
  const handle = page.getByTestId('process-diagram-resize-handle');
  const beforeHeight = await diagram.evaluate((node) => Math.round(node.getBoundingClientRect().height));

  const box = await handle.boundingBox();
  if (!box) throw new Error('流程图拖拽分隔条未渲染');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 96, { steps: 8 });
  await page.mouse.up();

  const afterDragHeight = await diagram.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  expect(afterDragHeight).toBeGreaterThan(beforeHeight + 60);

  await page.getByTestId('task-returnable-toggle').check();

  const afterRerenderHeight = await diagram.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  expect(Math.abs(afterRerenderHeight - afterDragHeight)).toBeLessThanOrEqual(4);
});

test('切换可退回后保持用户步骤备注框自动高度', async ({ page, request }) => {
  const documentName = `process-returnable-note-height-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.processes[0].tasks[0].steps[0].note = '第一行说明\\n第二行说明\\n第三行说明\\n第四行说明';

  await createDocument(request, documentName, doc);
  await openTaskEditor(page, documentName);

  const note = page.locator('.step-note').first();
  const beforeHeight = await note.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  expect(beforeHeight).toBeGreaterThan(60);

  await page.getByTestId('task-returnable-toggle').check();

  const afterHeight = await note.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  expect(afterHeight).toBeGreaterThan(60);
  expect(Math.abs(afterHeight - beforeHeight)).toBeLessThanOrEqual(4);
});

test('节点关联实体后保持抽屉滚动位置', async ({ page, request }) => {
  const documentName = `process-entity-op-scroll-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.entities = [
    { id: 'E1', name: '账号', group: '用户主题域', fields: [] },
    { id: 'E2', name: '会话', group: '用户主题域', fields: [] },
    { id: 'E3', name: '登录日志', group: '审计主题域', fields: [] },
  ];
  doc.processes[0].tasks[0].steps = Array.from({ length: 16 }, (_, index) => ({
    name: `步骤${index + 1}`,
    type: 'Query',
    note: `说明${index + 1}`,
  }));

  await createDocument(request, documentName, doc);
  await openTaskEditor(page, documentName);

  const drawerBody = page.locator('.proc-drawer .drawer-body');
  await drawerBody.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  const beforeScrollTop = await drawerBody.evaluate((node) => node.scrollTop);
  const beforeSelectTop = await page.evaluate(() => {
    const body = document.querySelector('.proc-drawer .drawer-body');
    const select = body?.querySelector('.add-eop-row select');
    if (!body || !select) return null;
    return select.getBoundingClientRect().top - body.getBoundingClientRect().top;
  });
  expect(beforeScrollTop).toBeGreaterThan(0);
  expect(beforeSelectTop).not.toBeNull();

  await page.locator('.add-eop-row select').selectOption('E1');
  await page.locator('.add-eop-row .btn').click();

  await expect(page.locator('.eop-tag')).toHaveCount(1);
  const afterScrollTop = await drawerBody.evaluate((node) => node.scrollTop);
  const afterSelectTop = await page.evaluate(() => {
    const body = document.querySelector('.proc-drawer .drawer-body');
    const select = body?.querySelector('.add-eop-row select');
    if (!body || !select) return null;
    return select.getBoundingClientRect().top - body.getBoundingClientRect().top;
  });
  expect(afterScrollTop).toBeGreaterThan(0);
  expect(afterSelectTop).not.toBeNull();
  expect(Math.abs(afterSelectTop - beforeSelectTop)).toBeLessThanOrEqual(4);
});

async function openProcessEditor(page, name) {
  await page.goto('/');
  await openDocument(page, name);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-overview').click();
  await page.locator('.ovc-body').first().click();
  await expect(page.locator('.proc-drawer .drawer-crumb').first()).toContainText('缁熶竴鐧诲綍');
}

test('流程支持上传多个 HTML 原型并在保存后保留', async ({ page, request }) => {
  const documentName = `process-prototypes-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openProcessEditor(page, documentName);
  await page.getByTestId('proc-prototype-input').setInputFiles([
    {
      name: 'login-a.html',
      mimeType: 'text/html',
      buffer: Buffer.from('<!doctype html><html><body><h1>原型A</h1><p>登录页</p></body></html>'),
    },
    {
      name: 'login-b.html',
      mimeType: 'text/html',
      buffer: Buffer.from('<!doctype html><html><body><h1>原型B</h1><p>审核页</p></body></html>'),
    },
  ]);
  await page.getByTestId('proc-prototype-upload-button').click();

  await expect(page.getByTestId('proc-prototype-item')).toHaveCount(2);
  await expect(page.locator('.prototype-file-name').nth(0)).toHaveText('login-a.html');
  await expect(page.locator('.prototype-file-name').nth(1)).toHaveText('login-b.html');

  const popupPromise = page.waitForEvent('popup');
  await page.getByTestId('proc-prototype-open').first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup.locator('h1')).toHaveText('原型A');
  await popup.close();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('proc-prototype-download').first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('login-a.html');

  await page.getByTestId('proc-prototype-remove').nth(1).click();
  await expect(page.getByTestId('proc-prototype-item')).toHaveCount(1);
  await expect(page.locator('.prototype-file-name').first()).toHaveText('login-a.html');

  await page.keyboard.press('Control+S');
  await expect(page.getByTestId('modified-badge')).toBeHidden();

  await openProcessEditor(page, documentName);
  await expect(page.getByTestId('proc-prototype-item')).toHaveCount(1);
  await expect(page.locator('.prototype-file-name').first()).toHaveText('login-a.html');
});

test('同名流程原型会新增版本并显示上传时间', async ({ page, request }) => {
  const documentName = `process-prototype-versions-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openProcessEditor(page, documentName);
  await page.getByTestId('proc-prototype-input').setInputFiles([
    {
      name: 'login-a.html',
      mimeType: 'text/html',
      buffer: Buffer.from('<!doctype html><html><body><h1>原型A-v1</h1></body></html>'),
    },
  ]);
  await page.getByTestId('proc-prototype-upload-button').click();

  await page.getByTestId('proc-prototype-input').setInputFiles([
    {
      name: 'login-a.html',
      mimeType: 'text/html',
      buffer: Buffer.from('<!doctype html><html><body><h1>原型A-v2</h1></body></html>'),
    },
  ]);
  await page.getByTestId('proc-prototype-upload-button').click();

  await expect(page.getByTestId('proc-prototype-item')).toHaveCount(1);
  await expect(page.locator('.prototype-file-version').first()).toContainText('当前 v2');
  await expect(page.locator('.prototype-file-version').first()).toContainText('共2版');

  await page.getByTestId('proc-prototype-toggle').first().click();
  await expect(page.getByTestId('proc-prototype-version-item')).toHaveCount(2);
  await expect(page.locator('.prototype-version-label').nth(0)).toContainText('v1');
  await expect(page.locator('.prototype-version-label').nth(1)).toContainText('v2');
  await expect(page.locator('.prototype-version-label').nth(1)).toContainText('当前引用');
  await expect(page.locator('.prototype-version-time').nth(0)).not.toHaveText('');

  const popupPromise = page.waitForEvent('popup');
  await page.getByTestId('proc-prototype-version-open').nth(1).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup.locator('h1')).toHaveText('原型A-v2');
  await popup.close();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('proc-prototype-version-download').first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('login-a.html');

  await page.keyboard.press('Control+S');
  await expect(page.getByTestId('modified-badge')).toBeHidden();

  await openProcessEditor(page, documentName);
  await page.getByTestId('proc-prototype-toggle').first().click();
  await expect(page.getByTestId('proc-prototype-version-item')).toHaveCount(2);
  await expect(page.locator('.prototype-version-label').nth(1)).toContainText('当前引用');
});

async function openTaskEditorByTask(page, name, taskId, taskName) {
  await page.goto('/');
  await openDocument(page, name);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-overview').click();
  await page.locator('.ovc-body').first().click();
  await page.locator(`#proc-diagram .pf-task[data-id="${taskId}"]`).click();
  await expect(page.locator('.proc-drawer .drawer-crumb').first()).toContainText(taskName);
}

test('可退回节点显示上方回退折线并抬高流程图高度', async ({ page, request }) => {
  const documentName = `process-return-line-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditorByTask(page, documentName, 'T2', 'T2');

  const label = page.locator('.proc-drawer label').filter({ has: page.getByTestId('task-returnable-toggle') });
  await expect(label).toContainText(/\u53ef\u9000\u56de/);
  await expect(label).not.toContainText(/\u53ef\u91cd\u590d/);

  const wrapHeightBefore = await page.locator('#proc-diagram .pf-wrap').evaluate((node) => node.getBoundingClientRect().height);

  await page.getByTestId('task-returnable-toggle').check();
  await expect(page.locator('#proc-diagram .pf-return-line')).toHaveCount(1);
  await expect(page.locator('#proc-diagram .pf-repeat')).toHaveCount(0);

  const lineMeta = await page.locator('#proc-diagram .pf-return-line').evaluate((node) => {
    const wrap = node.closest('.pf-wrap');
    const task = wrap?.querySelector('.pf-task[data-id="T2"]');
    const prevTask = wrap?.querySelector('.pf-task[data-id="T1"]');
    const wrapRect = wrap?.getBoundingClientRect();
    const taskRect = task?.getBoundingClientRect();
    const prevTaskRect = prevTask?.getBoundingClientRect();
    const points = String(node.getAttribute('points') || '').trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
    return {
      from: node.getAttribute('data-from'),
      to: node.getAttribute('data-to'),
      pointCount: points.length,
      startX: points[0]?.[0] ?? null,
      startY: points[0]?.[1] ?? null,
      endX: points[3]?.[0] ?? null,
      laneStartY: points[1]?.[1] ?? null,
      laneEndY: points[2]?.[1] ?? null,
      endY: points[3]?.[1] ?? null,
      taskLeft: taskRect && wrapRect ? taskRect.left - wrapRect.left : null,
      taskWidth: taskRect?.width ?? 0,
      prevTaskLeft: prevTaskRect && wrapRect ? prevTaskRect.left - wrapRect.left : null,
      prevTaskWidth: prevTaskRect?.width ?? 0,
      taskTop: taskRect && wrapRect ? taskRect.top - wrapRect.top : null,
      wrapHeight: node.closest('.pf-wrap')?.getBoundingClientRect().height ?? 0,
      wrapPosition: wrap ? window.getComputedStyle(wrap).position : '',
    };
  });

  expect(lineMeta.from).toBe('T2');
  expect(lineMeta.to).toBe('T1');
  expect(lineMeta.pointCount).toBe(4);
  expect(lineMeta.laneStartY).toBe(lineMeta.laneEndY);
  expect(lineMeta.laneStartY).toBeLessThan(lineMeta.startY);
  expect(lineMeta.laneEndY).toBeLessThan(lineMeta.endY);
  expect(Math.abs(lineMeta.startX - (lineMeta.taskLeft + lineMeta.taskWidth * 0.25))).toBeLessThanOrEqual(2);
  expect(Math.abs(lineMeta.endX - (lineMeta.prevTaskLeft + lineMeta.prevTaskWidth * 0.75))).toBeLessThanOrEqual(2);
  expect(Math.abs(lineMeta.startY - lineMeta.taskTop)).toBeLessThanOrEqual(2);
  expect(lineMeta.wrapPosition).toBe('relative');
  expect(lineMeta.wrapHeight).toBeGreaterThan(wrapHeightBefore);
});

test('连续可退回节点的回退线锚点错开避免重叠', async ({ page, request }) => {
  const documentName = `process-return-line-stagger-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.processes[0].tasks[1].repeatable = true;
  doc.processes[0].tasks[2].repeatable = true;
  await createDocument(request, documentName, doc);

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-overview').click();
  await page.locator('.ovc-body').first().click();
  await expect(page.locator('#proc-diagram .pf-return-line')).toHaveCount(2);

  const anchors = await page.evaluate(() => {
    const wrap = document.querySelector('#proc-diagram .pf-wrap');
    const wrapRect = wrap?.getBoundingClientRect();
    const taskRect = (id) => wrap?.querySelector(`.pf-task[data-id="${id}"]`)?.getBoundingClientRect();
    const current = taskRect('T2');
    const pointsByPair = new Map(
      [...document.querySelectorAll('#proc-diagram .pf-return-line')].map((node) => {
        const pair = `${node.getAttribute('data-from')}->${node.getAttribute('data-to')}`;
        const points = String(node.getAttribute('points') || '').trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
        return [pair, points];
      }),
    );
    return {
      taskLeft: current && wrapRect ? current.left - wrapRect.left : null,
      taskWidth: current?.width ?? 0,
      outgoingStartX: pointsByPair.get('T2->T1')?.[0]?.[0] ?? null,
      incomingEndX: pointsByPair.get('T3->T2')?.[3]?.[0] ?? null,
    };
  });

  expect(Math.abs(anchors.outgoingStartX - (anchors.taskLeft + anchors.taskWidth * 0.25))).toBeLessThanOrEqual(2);
  expect(Math.abs(anchors.incomingEndX - (anchors.taskLeft + anchors.taskWidth * 0.75))).toBeLessThanOrEqual(2);
  expect(anchors.incomingEndX - anchors.outgoingStartX).toBeGreaterThan(anchors.taskWidth * 0.35);
});

test('可退回节点状态下按钮缩放和滚轮缩放作用于整个流程图', async ({ page, request }) => {
  const documentName = `process-return-line-zoom-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditorByTask(page, documentName, 'T2', 'T2');
  await page.getByTestId('task-returnable-toggle').check();
  await expect(page.locator('#proc-diagram .pf-return-line')).toHaveCount(1);

  const readMetrics = () => page.evaluate(() => {
    const wrap = document.querySelector('#proc-diagram .pf-wrap');
    const task = document.querySelector('#proc-diagram .pf-task[data-id="T2"]');
    const line = document.querySelector('#proc-diagram .pf-return-line');
    return {
      zoom: Number.parseFloat(wrap?.style.zoom || '1'),
      taskWidth: task?.getBoundingClientRect().width || 0,
      lineWidth: line?.getBoundingClientRect().width || 0,
    };
  });

  const before = await readMetrics();
  expect(before.zoom).toBeCloseTo(1, 2);

  await page.locator('.drawer-diag:not(.taskflow-mode) .zoom-btn').first().click();

  const afterButton = await readMetrics();
  expect(afterButton.zoom).toBeCloseTo(1.2, 2);
  expect(afterButton.taskWidth).toBeGreaterThan(before.taskWidth + 5);
  expect(afterButton.lineWidth).toBeGreaterThan(before.lineWidth + 5);

  await page.locator('#proc-diagram').evaluate((node) => {
    node.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -120,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
  });

  const afterWheel = await readMetrics();
  expect(afterWheel.zoom).toBeCloseTo(1.35, 2);
  expect(afterWheel.taskWidth).toBeGreaterThan(afterButton.taskWidth + 5);
  expect(afterWheel.lineWidth).toBeGreaterThan(afterButton.lineWidth + 5);
});
