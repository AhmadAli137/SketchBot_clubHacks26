const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(
  projectRoot,
  'native-patches',
  'react-native-webrtc',
  'android',
  'src',
  'main',
  'java',
  'com',
  'oney',
  'WebRTCModule',
  'WebRTCView.java',
);
const targetPath = path.join(
  projectRoot,
  'node_modules',
  'react-native-webrtc',
  'android',
  'src',
  'main',
  'java',
  'com',
  'oney',
  'WebRTCModule',
  'WebRTCView.java',
);

if (!fs.existsSync(sourcePath)) {
  console.warn('[apply-react-native-webrtc-patch] Source patch file not found, skipping.');
  process.exit(0);
}

if (!fs.existsSync(targetPath)) {
  console.warn('[apply-react-native-webrtc-patch] Target react-native-webrtc file not found, skipping.');
  process.exit(0);
}

const source = fs.readFileSync(sourcePath, 'utf8');
const target = fs.readFileSync(targetPath, 'utf8');

if (source === target) {
  console.log('[apply-react-native-webrtc-patch] react-native-webrtc already patched.');
  process.exit(0);
}

fs.writeFileSync(targetPath, source, 'utf8');
console.log('[apply-react-native-webrtc-patch] Applied native WebRTC Android renderer patch.');
