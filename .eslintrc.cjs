module.exports = {
  env: {
    browser: true,
    es2021: true
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'script'
  },
  rules: {
    'no-unused-vars': 'warn',
    'no-undef': 'off',        // Alpine.js globals (store, etc.) are browser-injected
    'no-console': 'off',
    'semi': ['warn', 'always'],
    'no-var': 'warn',
    'eqeqeq': 'warn'
  },
  ignorePatterns: ['dist/', 'node_modules/', 'public/']
};
