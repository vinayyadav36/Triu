module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'commonjs'
  },
  rules: {
    'no-unused-vars': 'warn',
    'no-console': 'off',
    'semi': ['warn', 'always'],
    'no-var': 'warn',
    'eqeqeq': 'warn'
  },
  ignorePatterns: ['node_modules/', 'coverage/']
};
