// ⚙️ Dev runner — รัน .ts test scripts โดย transpile ผ่าน typescript
// ใช้รัน scripts/font-registry-test.ts และ scripts/ass-builder-test.ts
// ที่เดิมต้อง node --experimental-strip-types (ซึ่ง resolve import ที่ไม่มี .ts ไม่ได้)
//
// รัน: node scripts/run-ts-test.cjs scripts/<test>.ts
const fs = require('fs');
const ts = require('typescript');

// register .ts ให้ require() ค้นหา + transpile ได้ (Node จะ search .ts อัตโนมัติ
// เพราะ iterates keys ของ Module._extensions)
require.extensions['.ts'] = function (module, filename) {
  const src = fs.readFileSync(filename, 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.Node10,
    },
    fileName: filename,
  }).outputText;
  module._compile(out, filename);
};

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/run-ts-test.cjs <path-to-.ts>');
  process.exit(1);
}
require(require('path').resolve(target));
