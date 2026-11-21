// Works on the package and the example site together: builds the package,
// keeps rebuilding it on change (scripts/build.mjs --watch), and runs the
// example site's dev server. Ctrl+C stops both.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const children = [];
const run = (command, args) => {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
  children.push(child);
  child.on('exit', (code) => {
    for (const other of children) if (other !== child) other.kill('SIGTERM');
    process.exit(code ?? 0);
  });
  return child;
};
const stop = () => children.forEach((child) => child.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

run(process.execPath, [join(root, 'scripts', 'build.mjs'), '--watch']);
// Start the site once the first build has written the entry point.
const started = Date.now();
const waitForBuild = setInterval(() => {
  if (existsSync(join(root, 'dist', 'index.js')) && existsSync(join(root, 'dist', 'next', 'index.js')) || Date.now() - started > 120_000) {
    clearInterval(waitForBuild);
    run('npm', ['run', 'dev:site', '-w', 'cera-next-site']);
  }
}, 500);
