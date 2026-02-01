import nx from '@nx/eslint-plugin';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  ...nx.configs['flat/react'],
  {
    ignores: ['**/dist', '**/out-tsc'],
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
    ],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [
            '^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$',
            'apps/script/**/*',
          ],
          depConstraints: [
            {
              sourceTag: 'scope:client',
              onlyDependOnLibsWithTags: ['scope:shared-types', 'scope:shared-db'],
            },
            {
              sourceTag: 'scope:server',
              onlyDependOnLibsWithTags: ['scope:shared-types', 'scope:shared-db'],
            },
            {
              sourceTag: 'scope:shared-db',
              onlyDependOnLibsWithTags: ['scope:shared-db', 'scope:shared-types'],
            },
            {
              sourceTag: 'scope:shared-types',
              onlyDependOnLibsWithTags: ['scope:shared-types'],
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/fact-server/**/*'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    files: ['apps/fact-index/**/*'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: {
      'jsx-a11y': jsxA11y,
    },
    rules: {
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/no-onchange': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/anchor-is-valid': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',
    },
  },
];
