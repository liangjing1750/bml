const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const toolDir = path.resolve(__dirname, '..');
const workspaceDir = path.join(toolDir, '.tmp', 'doc-screenshots-workspace');
const screenshotDir = path.join(repoRoot, 'docs', 'screenshots');
const port = '8898';
const baseUrl = `http://127.0.0.1:${port}`;

function buildDocument(name, { processName, entityName, relationLabel }) {
  return {
    meta: {
      title: name,
      domain: name,
      author: 'BLM',
      date: '2026-04-21',
    },
    roles: [
      {
        id: 'R1',
        name: '业务专员',
        desc: '',
        group: '业务参与方',
        subDomains: ['采购'],
      },
    ],
    language: [
      {
        term: '采购申请',
        definition: '业务侧提交的采购需求单据',
      },
    ],
    processes: [
      {
        id: 'P1',
        name: processName,
        trigger: '提交申请',
        outcome: '完成审核',
        tasks: [
          {
            id: 'T1',
            name: '登记申请',
            role_id: 'R1',
            role: '业务专员',
            repeatable: false,
            rules_note: '申请单必须填写完整',
            steps: [
              {
                name: '填写申请',
                type: 'Fill',
                note: '录入采购主题、预算和数量',
              },
            ],
            entity_ops: [
              {
                entity_id: 'E1',
                ops: ['C', 'R'],
              },
            ],
          },
        ],
      },
    ],
    entities: [
      {
        id: 'E1',
        name: entityName,
        group: '采购',
        note: '',
        fields: [
          {
            name: '申请单号',
            type: 'id',
            is_key: true,
            is_status: false,
            state_values: '',
            note: '',
          },
          {
            name: '单据状态',
            type: 'enum',
            is_key: false,
            is_status: true,
            state_values: '草稿/待审核/已完成',
            note: '业务主状态',
          },
        ],
        state_transitions: [
          {
            from: '草稿',
            to: '待审核',
            action: '提交',
            note: '提交后进入审批',
            field_name: '单据状态',
          },
        ],
      },
    ],
    relations: [
      {
        from: 'E1',
        to: 'E1',
        type: 'reference',
        label: relationLabel,
      },
    ],
    rules: [
      {
        id: 'RULE-1',
        name: '预算校验',
        type: 'check',
        applies_to: 'P1',
        description: '预算必须大于零',
        formula: '',
      },
    ],
  };
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/files`);
      if (response.ok) return;
    } catch (_) {
      // ignore until ready
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('等待 BLM 服务启动超时');
}

async function createDocument(name, document) {
  const response = await fetch(`${baseUrl}/api/save/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(document),
  });
  if (!response.ok) {
    throw new Error(`创建文档失败: ${name}`);
  }
}

async function ensureWorkspace() {
  fs.rmSync(workspaceDir, { recursive: true, force: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function captureScreenshots() {
  await ensureWorkspace();

  const serverProcess = spawn('python', ['blm.py'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BLM_PORT: port,
      BLM_NO_BROWSER: '1',
      BLM_WORKSPACE_DIR: workspaceDir,
    },
    stdio: 'ignore',
  });

  try {
    await waitForServer();

    await createDocument(
      '采购协同平台-v1',
      buildDocument('采购协同平台-v1', {
        processName: '采购申请流程',
        entityName: '采购申请单',
        relationLabel: '同源申请',
      }),
    );
    await createDocument(
      '采购协同平台-v2',
      buildDocument('采购协同平台-v2', {
        processName: '采购审批流程',
        entityName: '审批记录',
        relationLabel: '审批引用',
      }),
    );

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });

    await page.goto(baseUrl);
    await page.getByTestId('toolbar-open-button').click();
    await page.locator('.open-modal-shell').screenshot({
      path: path.join(screenshotDir, '05_open_dialog.png'),
    });

    await page.locator('.file-list-item').filter({ hasText: '采购协同平台-v1' }).first().click();
    await page.screenshot({
      path: path.join(screenshotDir, '06_workspace_editor.png'),
      fullPage: true,
    });

    await page.getByTestId('toolbar-merge-button').click();
    await page.locator('.merge-modal').screenshot({
      path: path.join(screenshotDir, '07_merge_dialog.png'),
    });

    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.getByTestId('merge-confirm-button').click();
    await page.getByTestId('merge-modal').waitFor({ state: 'hidden' });
    await page.screenshot({
      path: path.join(screenshotDir, '08_merge_result.png'),
      fullPage: true,
    });

    await browser.close();
  } finally {
    serverProcess.kill();
  }
}

captureScreenshots().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
