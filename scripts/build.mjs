// Builds the package into dist/: JavaScript and type definitions from src/
// (tsconfig.build.json), plus the admin's stylesheet. `--watch` rebuilds on
// change, for working on the package and the example site together.
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, watch, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const watching = process.argv.includes('--watch');
const assets = ['admin/admin.css'];
// npm links the compiler here (TypeScript 7 ships it as a native binary).
const tsc = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');

function copyAssets() {
  for (const asset of assets) {
    mkdirSync(dirname(join(root, 'dist', asset)), { recursive: true });
    copyFileSync(join(root, 'src', asset), join(root, 'dist', asset));
  }
}

/**
 * TypeScript rewrites relative ".ts" imports to ".js" in JavaScript but not in
 * type definitions. Rewrite those too, so any consumer's TypeScript resolves
 * them (to the matching .d.ts), whatever its settings.
 */
function rewriteDeclarations(directory = join(root, 'dist')) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) rewriteDeclarations(path);
    else if (entry.name.endsWith('.d.ts')) {
      const text = readFileSync(path, 'utf8');
      const rewritten = text.replace(/((?:from|import)\s*\(?\s*['"])(\.{1,2}\/[^'"]+?)\.tsx?(['"])/g, '$1$2.js$3');
      if (rewritten !== text) writeFileSync(path, rewritten);
    }
  }
}

rmSync(join(root, 'dist'), { recursive: true, force: true });
copyAssets();
const compiler = spawn(tsc, ['-p', join(root, 'tsconfig.build.json'), ...(watching ? ['--watch', '--preserveWatchOutput'] : [])], { stdio: 'inherit' });

if (watching) {
  for (const asset of assets) watch(join(root, 'src', asset), () => copyAssets());
  // In watch mode the declarations keep ".ts" imports, which this repo's example resolves (allowImportingTsExtensions).
} else {
  compiler.on('exit', (code) => {
    if (code === 0) rewriteDeclarations();
    process.exit(code ?? 1);
  });
}
