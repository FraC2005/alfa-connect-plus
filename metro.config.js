const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Expo's default asset extensions don't include 3D model formats. Needed so Metro bundles the .glb
// model used by src/components/car-3d-view.tsx as a binary asset instead of trying to parse it as source.
config.resolver.assetExts.push('glb', 'gltf');

module.exports = config;
