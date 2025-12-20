const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const filesToCheck = [
  'index.html',
  'js/main.js',
  'js/ui.js',
  'js/rag.js'
];

let allOk = true;
filesToCheck.forEach(f => {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) {
    console.error('Missing:', f);
    allOk = false;
  } else {
    console.log('Found:', f);
  }
});

if (!allOk) {
  console.error('Smoke test failed');
  process.exit(2);
}

console.log('Smoke test passed');
