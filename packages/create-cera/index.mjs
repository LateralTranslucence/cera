#!/usr/bin/env node
/**
 * Starts a Next.js site with Cera, and gets it running:
 *
 *   npm create cera my-site
 *   (from a Cera checkout: npm run new-site -- ../my-site)
 *
 * Copies the template (the Cera example site, its Supabase settings and
 * migrations) into a new folder, names it, gives it its own ports, installs
 * it, starts its local Supabase stack, writes .env.local, seeds an admin
 * account and example pages, and makes the first git commit. `--cera` sets
 * the version of @lateraltranslucence/cera to install, or a local Cera (a
 * checkout, built, or a tarball from `npm pack`): that is packed into the
 * site as vendor/cera.tgz, so the site has its own copy and deploys as is.
 *
 * Skip parts with --no-install (then nothing after copying runs), --no-start
 * (no Supabase, env or seed) and --no-git.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockPorts, envValue, movePorts, packageName, pickDevPort, pickPortBlock, shellQuote, siteSupabaseConfig } from './lib.mjs';

const template = join(dirname(fileURLToPath(import.meta.url)), 'template');
const parameters = process.argv.slice(2);

function option(name) {
  const index = parameters.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = parameters[index + 1];
  parameters.splice(index, 2);
  return value;
}
function flag(name) {
  const index = parameters.indexOf(`--${name}`);
  if (index === -1) return false;
  parameters.splice(index, 1);
  return true;
}

const ceraSpec = option('cera');
const install = !flag('no-install');
const start = install && !flag('no-start');
const git = !flag('no-git');

if (parameters.includes('--help') || parameters.includes('-h')) {
  console.log(`Usage: npm create cera <folder> [-- --cera <version, path or tarball>] [--no-install] [--no-start] [--no-git]

Makes the site, installs it, starts its local Supabase stack (needs Docker and
the Supabase CLI), writes .env.local, seeds an admin account and example pages,
and makes the first git commit.

  --no-install  only copy and name the site
  --no-start    install, but don't start Supabase or seed
  --no-git      no git repository`);
  process.exit(0);
}

const folder = parameters[0];
if (!folder) {
  console.error('Name the folder for the new site: npm create cera my-site');
  process.exit(1);
}
if (!existsSync(template)) {
  console.error('This copy of create-cera has no template. In the Cera repository, run `npm run new-site` instead, or `npm run sync --prefix packages/create-cera` first.');
  process.exit(1);
}

const target = resolve(folder);
if (existsSync(target) && readdirSync(target).length > 0) {
  console.error(`${target} isn't empty. Pick a new folder.`);
  process.exit(1);
}

const name = packageName(basename(target));

// Ports of its own, so it runs next to Cera and other sites.
const block = await pickPortBlock();
const devPort = await pickDevPort();
if (block === null || devPort === null) {
  console.error('No free ports for the new site’s Supabase stack (57020 to 64929) or dev server (3101 to 3199). Stop some local stacks and try again.');
  process.exit(1);
}

cpSync(template, target, { recursive: true });
renameSync(join(target, 'gitignore'), join(target, '.gitignore'));

/**
 * A local Cera (a folder, or a tarball) as vendor/cera.tgz in the site.
 * A link to a folder outside the site would neither run (Next's dev server
 * stays inside the site, and Cera would load its own copy of React) nor
 * deploy.
 */
function vendorCera(spec) {
  const source = resolve(spec);
  if (!existsSync(source)) {
    console.error(`No Cera at ${source}.`);
    process.exit(1);
  }
  mkdirSync(join(target, 'vendor'), { recursive: true });
  const destination = join(target, 'vendor', 'cera.tgz');
  if (statSync(source).isFile()) {
    copyFileSync(source, destination);
  } else {
    if (!existsSync(join(source, 'dist', 'index.js'))) {
      console.error(`${source} isn't built. Run \`npm run build\` there first (or use \`npm run new-site\`, which does).`);
      process.exit(1);
    }
    const packed = mkdtempSync(join(tmpdir(), 'cera-pack-'));
    const result = spawnSync('npm', ['pack', '--json', '--pack-destination', packed], { cwd: source, encoding: 'utf8' });
    if (result.status !== 0) {
      console.error(`Couldn't pack Cera:\n${result.stderr}`);
      process.exit(1);
    }
    copyFileSync(join(packed, JSON.parse(result.stdout)[0].filename), destination);
    rmSync(packed, { recursive: true, force: true });
  }
  return 'file:vendor/cera.tgz';
}
const isLocal = (spec) => spec.startsWith('.') || spec.startsWith('/') || spec.endsWith('.tgz');
const ceraDependency = ceraSpec && (isLocal(ceraSpec) ? vendorCera(ceraSpec) : ceraSpec);

const fill = (file, replace) => {
  const path = join(target, file);
  if (existsSync(path)) writeFileSync(path, replace(readFileSync(path, 'utf8')));
};
fill('package.json', (text) => {
  const site = JSON.parse(movePorts(text.replaceAll('__NAME__', name), { block, devPort }));
  if (ceraDependency) site.dependencies['@lateraltranslucence/cera'] = ceraDependency;
  return `${JSON.stringify(site, null, 2)}\n`;
});
fill('README.md', (text) => movePorts(text.replaceAll('__NAME__', name), { block, devPort }));
for (const file of ['.env.example', 'lib/email.ts']) fill(file, (text) => movePorts(text, { block, devPort }));
fill('supabase/config.toml', (text) => siteSupabaseConfig(text, { name, block, devPort }));

const ports = blockPorts(block);
console.log(`\nMade ${name} in ${target}.\nIts local Supabase uses ports ${ports[0]} to ${ports[ports.length - 1]}, and its dev server port ${devPort}.\n`);

/** Runs a command in the new site, showing its output. True when it worked. */
function run(command, args, { quiet = false } = {}) {
  if (!quiet) console.log(`\n> ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, { cwd: target, stdio: quiet ? 'ignore' : 'inherit' });
  return result.status === 0;
}
const has = (command, args = ['--version']) => spawnSync(command, args, { stdio: 'ignore' }).status === 0;

const cd = `cd ${shellQuote(folder)}`;
const remaining = [];
let problem = '';

if (git && has('git')) run('git', ['init', '-q'], { quiet: true });

if (!install) {
  remaining.push('npm install', 'supabase start', 'npm run env', 'npm run seed');
} else if (!run('npm', ['install'])) {
  problem = 'npm install failed (see above).';
  remaining.push('npm install', 'supabase start', 'npm run env', 'npm run seed');
} else if (!start) {
  remaining.push('supabase start', 'npm run env', 'npm run seed');
} else if (!has('supabase')) {
  problem = 'The Supabase CLI isn’t installed: https://supabase.com/docs/guides/local-development/cli/getting-started';
  remaining.push('supabase start', 'npm run env', 'npm run seed');
} else if (!has('docker', ['info'])) {
  problem = 'Docker isn’t running. Start Docker Desktop (or another Docker), then run the steps below.';
  remaining.push('supabase start', 'npm run env', 'npm run seed');
} else if (!run('supabase', ['start'])) {
  problem = 'supabase start failed (see above).';
  remaining.push('supabase start', 'npm run env', 'npm run seed');
} else if (!run('npm', ['run', 'env'])) {
  problem = 'npm run env failed (see above).';
  remaining.push('npm run env', 'npm run seed');
} else if (!run('npm', ['run', 'seed'])) {
  problem = 'npm run seed failed (see above).';
  remaining.push('npm run seed');
}

// The first commit, once the lockfile exists. Skipped when git has no name or email to commit with.
if (git && existsSync(join(target, '.git'))) {
  const committed = run('git', ['add', '-A'], { quiet: true }) && run('git', ['commit', '-q', '-m', `Start ${name} with Cera`], { quiet: true });
  if (!committed) console.log('\nMade a git repository, but didn’t commit: set git’s user.name and user.email, then commit.');
}

const envFile = join(target, '.env.local');
const env = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
if (problem) console.log(`\n${problem}`);
if (remaining.length) {
  console.log(`\nTo finish:\n  ${cd}\n${remaining.map((step) => `  ${step}`).join('\n')}\n  npm run dev\n\nThen open http://localhost:${devPort}/admin.`);
} else {
  console.log(`
${name} is ready.

  ${cd}
  npm run dev

Then open http://localhost:${devPort}/admin and sign in as ${envValue(env, 'CERA_ADMIN_EMAIL')}
(the password is CERA_ADMIN_PASSWORD in .env.local). Supabase Studio: http://127.0.0.1:${block * 100 + 23}.
Stop the local database with \`supabase stop\` when you're done.`);
}
process.exit(problem ? 1 : 0);
