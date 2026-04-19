const path = require('node:path');

const rootDir = path.resolve(__dirname, '..', '..', '..');
const workspaceDir = path.join(rootDir, '.tmp', 'playwright-workspace');

module.exports = {
  workspaceDir,
};
