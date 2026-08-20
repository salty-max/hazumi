import type { UserConfig } from '@commitlint/types';

/**
 * Scopes mirror the workspace layout. Adding a package means adding its scope
 * here, so commit history stays greppable by subsystem.
 */
const scopes = [
  'core',
  'math',
  'color',
  'graphics',
  'webgl2',
  'canvas2d',
  'svg',
  'headless',
  'matter',
  'vite-plugin',
  'docs',
  'playground',
  'examples',
  'repo',
  'deps',
];

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', scopes],
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
  },
};

export default config;
