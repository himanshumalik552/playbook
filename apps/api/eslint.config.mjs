import base from '@adpulse/eslint-config/base';

export default [
  ...base,
  {
    // Lets consistent-type-imports keep value imports for classes that NestJS reads through decorator metadata.
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: { parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true } },
  },
];
