// Makes a new site from this repository, in one command:
//
//   npm run new-site -- ../my-site
//
// Refreshes create-cera's template from the example site, builds the package,
// then runs create-cera with this repository as the site's Cera: packed into
// the site as vendor/cera.tgz, so the site has its own copy (it runs and
// deploys without this checkout). `npm run update-site` brings it up to date
// later. Any other options go on to create-cera: --no-start, --no-install,
// --no-git.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const passed = process.argv.slice(2);

if (passed.length === 0 || passed.includes('--help') || passed.includes('-h')) {
  console.log('Usage: npm run new-site -- <folder> [--no-start] [--no-install] [--no-git]\n\nMakes a site with this checkout’s Cera (packed into vendor/cera.tgz), then installs, starts and seeds it.');
  process.exit(passed.length === 0 ? 1 : 0);
}
if (passed.includes('--cera')) {
  console.error('new-site always uses this checkout. To use a published Cera, run create-cera itself with --cera.');
  process.exit(1);
}

const step = (label, command, args) => {
  console.log(`\n${label}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

step('Refreshing the template from the example site…', process.execPath, [join(root, 'packages', 'create-cera', 'scripts', 'sync-template.mjs')]);
step('Building the package…', process.execPath, [join(root, 'scripts', 'build.mjs')]);
// The folder is relative to where the command was typed (npm sets INIT_CWD), not to this repository.
const result = spawnSync(process.execPath, [join(root, 'packages', 'create-cera', 'index.mjs'), ...passed, '--cera', root], { cwd: process.env.INIT_CWD ?? process.cwd(), stdio: 'inherit' });
process.exit(result.status ?? 1);
