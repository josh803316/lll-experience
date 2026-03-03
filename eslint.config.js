import josh803316SharedConfig from '@josh803316/shared-config/eslint.config.js';

const config = [
  ...josh803316SharedConfig,
  {
    ignores: ['dist/', 'node_modules/', 'patches/'],
  },
];

export default config;
