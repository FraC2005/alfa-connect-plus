// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // eslint-config-expo's require() allow-list mirrors Metro's default assetExts, which don't include
    // 3D model formats; metro.config.js adds .glb/.gltf to assetExts, so this mirrors that here too.
    files: ['src/components/car-3d-view.tsx'],
    rules: {
      '@typescript-eslint/no-require-imports': ['warn', { allow: ['\\.(glb|gltf)$'] }],
      // react-three-fiber's intrinsic elements (mesh, group, ambientLight...) aren't DOM props; this
      // plugin only knows react-dom's element/attribute set.
      'react/no-unknown-property': 'off',
    },
  },
]);
