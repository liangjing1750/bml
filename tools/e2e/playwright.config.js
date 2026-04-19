const fs = require('node:fs');
const path = require('node:path');

const toolDir = __dirname;
const repoRoot = path.resolve(toolDir, '..', '..');
const workspaceDir = path.join(toolDir, '.tmp', 'playwright-workspace');

fs.rmSync(workspaceDir, { recursive: true, force: true });
fs.mkdirSync(workspaceDir, { recursive: true });

module.exports = {
  testDir: path.join(toolDir, 'tests'),
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8899',
    headless: true,
  },
  webServer: {
    command: 'python bml.py',
    url: 'http://127.0.0.1:8899',
    reuseExistingServer: false,
    timeout: 30_000,
    cwd: repoRoot,
    env: {
      ...process.env,
      BML_PORT: '8899',
      BML_NO_BROWSER: '1',
      BML_WORKSPACE_DIR: workspaceDir,
    },
  },
};
