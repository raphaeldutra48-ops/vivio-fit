const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

/**
 * Metro em monorepo pnpm.
 *
 * Sem watchFolders o bundler não enxerga packages/*, e sem nodeModulesPaths ele
 * não resolve as dependências que o pnpm deixa na raiz do workspace.
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// A busca hierárquica fica LIGADA de propósito: packages/ui-native importa
// @vivio/ui a partir do próprio node_modules, e desligá-la quebraria essa
// resolução. (Desligar só faz sentido com nodeLinker isolado.)

module.exports = config;
