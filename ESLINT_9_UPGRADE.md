# ESLint 9.x Upgrade Guide

## Current Status

The project currently uses ESLint 8.56.0. ESLint 9.x introduces significant breaking changes with the new flat config format.

## Why Not Upgrade Yet

1. **Dependency Compatibility**: Many TypeScript-ESLint plugins are still catching up with ESLint 9.x support
2. **Flat Config Migration**: ESLint 9.x requires migrating from `.eslintrc.json` to flat config format (`eslint.config.js`)
3. **Breaking Changes**: Several rules and configurations have changed behavior

## When to Upgrade

Monitor these dependencies for ESLint 9.x support:
- `@typescript-eslint/eslint-plugin` - Currently at v6.17.0 (need v8.x for ESLint 9)
- `@typescript-eslint/parser` - Currently at v6.17.0 (need v8.x for ESLint 9)

Check compatibility at: https://github.com/typescript-eslint/typescript-eslint/releases

## Upgrade Steps (When Ready)

### 1. Update Dependencies

```bash
npm install --save-dev eslint@^9.0.0 \
  @typescript-eslint/eslint-plugin@^8.0.0 \
  @typescript-eslint/parser@^8.0.0
```

### 2. Migrate to Flat Config

Create `eslint.config.js` (replaces `.eslintrc.json`):

```javascript
import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  eslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Migrate existing rules from .eslintrc.json
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-var-requires': 'error',
      // Add other rules as needed
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'src/thrift/generated/'],
  },
];
```

### 3. Update package.json

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

### 4. Test the Migration

```bash
npm run lint
```

### 5. Remove Old Config

After confirming everything works:
```bash
rm .eslintrc.json
```

## Current Workaround

For now, we continue using ESLint 8.x which is still maintained and works well for our needs.

## References

- [ESLint 9.x Migration Guide](https://eslint.org/docs/latest/use/migrate-to-9.0.0)
- [TypeScript-ESLint v8 Roadmap](https://github.com/typescript-eslint/typescript-eslint/discussions/7103)
- [Flat Config Documentation](https://eslint.org/docs/latest/use/configure/configuration-files)

## Compatibility Matrix

| Package | Current Version | ESLint 9.x Compatible Version |
|---------|----------------|-------------------------------|
| eslint | 8.56.0 | 9.0.0+ |
| @typescript-eslint/eslint-plugin | 6.17.0 | 8.0.0+ |
| @typescript-eslint/parser | 6.17.0 | 8.0.0+ |

**Status**: ⏳ Waiting for TypeScript-ESLint v8.x stable release
