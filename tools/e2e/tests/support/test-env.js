const path = require('node:path');

const toolDir = path.resolve(__dirname, '..', '..');
const workspaceDir = path.join(toolDir, '.tmp', 'playwright-workspace');

module.exports = {
  workspaceDir,
};
