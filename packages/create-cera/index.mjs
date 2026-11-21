#!/usr/bin/env node
/**
 * Starts a Next.js site with Cera:
 *
 *   npm create cera my-site
 *   npx create-cera my-site --cera ^0.1.0
 *
 * Copies the template (the Cera example site, its Supabase settings and
 * migrations) into a new folder and names it. `--cera` sets the version (or
 * a path or tarball) of @lateraltranslucence/cera to install.
 */
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const template = join(dirname(fileURLToPath(import.meta.url)), 'template');
const parameters = process.argv.slice(2);

function option(name) {
  const index = parameters.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = parameters[index + 1];
  parameters.splice(index, 2);
  return value;
}

const ceraSpec = option('cera');
if (parameters.includes('--help') || parameters.includes('-h')) {
  console.log('Usage: npm create cera <folder> [-- --cera <version, path or tarball>]');
  process.exit(0);
}
const folder = parameters[0];
if (!folder) {
  console.error('Name the folder for the new site: npm create cera my-site');
  process.exit(1);
}
if (!existsSync(template)) {
  console.error('This copy of create-cera has no template. In the Cera repository, run `npm run sync --prefix packages/create-cera` first.');
  process.exit(1);
}

const target = resolve(folder);
if (existsSync(target) && readdirSync(target).length > 0) {
  console.error(`${target} isn't empty. Pick a new folder.`);
  process.exit(1);
}

// npm package names: lowercase, no spaces.
const name =
  basename(target)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|-+$/g, '') || 'cera-site';

cpSync(template, target, { recursive: true });
renameSync(join(target, 'gitignore'), join(target, '.gitignore'));

const fill = (file, replace) => writeFileSync(join(target, file), replace(readFileSync(join(target, file), 'utf8')));
fill('package.json', (text) => {
  const site = JSON.parse(text.replaceAll('__NAME__', name));
  if (ceraSpec) site.dependencies['@lateraltranslucence/cera'] = ceraSpec.startsWith('.') || ceraSpec.startsWith('/') ? `file:${resolve(ceraSpec)}` : ceraSpec;
  return `${JSON.stringify(site, null, 2)}\n`;
});
fill('README.md', (text) => text.replaceAll('__NAME__', name));
// Each local Supabase stack needs its own project id.
fill('supabase/config.toml', (text) => text.replace(/^project_id = ".*"$/m, `project_id = "${name}"`));

const shellFolder = /[^\w./-]/.test(folder) ? `'${folder.replaceAll("'", "'\\''")}'` : folder;
console.log(`
Made ${name} in ${target}.

Next:
  cd ${shellFolder}
  npm install
  supabase start
  npm run env
  npm run seed
  npm run dev

Then open http://localhost:3100/admin.
`);
