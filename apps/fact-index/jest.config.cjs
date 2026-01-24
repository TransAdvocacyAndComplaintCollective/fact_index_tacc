module.exports = {
  displayName: 'fact-index',
  preset: '../../jest.preset.cjs',
  transform: {
    '^(?!.*\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
    '^.+\.[tj]sx?$': ['babel-jest', { presets: ['@nx/react/babel'] }],
  },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/apps/fact-index',
};
