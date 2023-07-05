// eslint-disable-next-line no-undef
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  coveragePathIgnorePatterns: ['node_modules', 'src/typechain'],
  workerThreads: true,
};
