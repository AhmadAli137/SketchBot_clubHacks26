const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

function toBlockPattern(targetPath) {
  const escaped = targetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\\/g, '[\\\\/]');
  return new RegExp(`^${escaped}[\\\\/].*`);
}

config.watchFolders = [workspaceRoot];
config.resolver.blockList = [
  toBlockPattern(path.join(workspaceRoot, 'apps', 'desktop', 'renderer', '.next')),
  toBlockPattern(path.join(workspaceRoot, 'apps', 'admin-web', '.next')),
  toBlockPattern(path.join(workspaceRoot, 'apps', 'desktop', 'dist')),
  toBlockPattern(path.join(workspaceRoot, 'apps', 'desktop', 'out')),
];

module.exports = config;
