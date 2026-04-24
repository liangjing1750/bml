const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test, expect } = require('@playwright/test');
const { createDocument, openDocument } = require('./support/app-helpers');

test('预览页导出会下载文档包 ZIP，并保留流程原型', async ({ page, request }) => {
  const documentName = `preview-export-${Date.now()}`;
  const downloads = [];
  const prototypeHtml = '<!doctype html><html><body><h1>prototype-a</h1></body></html>';

  await createDocument(request, documentName, {
    meta: {
      title: documentName,
      domain: documentName,
      author: '',
      date: '2026-04-23',
    },
    roles: [],
    language: [],
    stages: [
      {
        id: 'S1',
        name: '账户接入阶段',
        subDomain: '账号',
        pos: { x: 0, y: 0 },
        processLinks: [],
      },
    ],
    stageLinks: [],
    processes: [
      {
        id: 'P1',
        name: '登录流程',
        subDomain: '账号',
        stageId: 'S1',
        flowGroup: '认证',
        trigger: '',
        outcome: '',
        prototypeFiles: [
          {
            uid: 'proto-a',
            name: 'login-a.html',
            content: prototypeHtml,
            contentType: 'text/html',
          },
        ],
        nodes: [],
      },
    ],
    entities: [],
    relations: [],
    rules: [],
  });

  page.on('download', (download) => downloads.push(download));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-preview').click();
  await page.getByTestId('preview-export-bundle').click();

  await expect
    .poll(() => downloads.length, {
      message: '等待 ZIP 文档包下载生成',
    })
    .toBe(1);

  const zipDownload = downloads[0];
  expect(zipDownload.suggestedFilename()).toBe(`${documentName}.zip`);
  const zipPath = path.join(os.tmpdir(), `${documentName}.zip`);
  await zipDownload.saveAs(zipPath);

  const inspection = JSON.parse(execFileSync('python', [
    '-c',
    [
      'import io, json, sys, zipfile',
      'archive = zipfile.ZipFile(sys.argv[1])',
      'names = sorted(archive.namelist())',
      'manifest = json.loads(archive.read(f"{sys.argv[2]}/manifest.json").decode("utf-8"))',
      'prototype = manifest["processes"][0]["prototypeFiles"][0]',
      'attachment_index = json.loads(archive.read(f"{sys.argv[2]}/attachments/attachments.json").decode("utf-8"))',
      'attachment = attachment_index["attachments"][0]',
      'version = attachment["versions"][0]',
      'print(json.dumps({',
      '  "names": names,',
      '  "title": manifest["meta"]["title"],',
      '  "prototype_uid": prototype["uid"],',
      '  "prototype_version_uid": prototype["versionUid"],',
      '  "attachment_name": attachment["name"],',
      '  "prototype_path": version["path"],',
      '  "prototype_html": archive.read(f"{sys.argv[2]}/{version[\"path\"]}").decode("utf-8"),',
      '  "markdown": archive.read(f"{sys.argv[2]}/{sys.argv[2]}.md").decode("utf-8"),',
      '}))',
    ].join('\n'),
    zipPath,
    documentName,
  ], { encoding: 'utf-8' }));

  expect(inspection.title).toBe(documentName);
  expect(Array.isArray(inspection.names)).toBeTruthy();
  expect(inspection.names).toContain(`${documentName}/manifest.json`);
  expect(inspection.names).toContain(`${documentName}/${documentName}.md`);
  expect(inspection.names).toContain(`${documentName}/attachments/attachments.json`);
  expect(inspection.prototype_uid).toBe('proto-a');
  expect(inspection.prototype_version_uid).toBeTruthy();
  expect(inspection.attachment_name).toBe('login-a.html');
  expect(inspection.prototype_path).toMatch(/^attachments\/[^/]+\/v1__login-a\.html$/);
  expect(inspection.names).toContain(`${documentName}/${inspection.prototype_path}`);
  expect(inspection.prototype_html).toContain('prototype-a');
  expect(inspection.markdown).toContain(`# ${documentName}`);
  expect(inspection.markdown).toContain('业务阶段');
  expect(inspection.markdown).toContain('账户接入阶段');
  expect(inspection.markdown).toContain('login-a.html');
});
