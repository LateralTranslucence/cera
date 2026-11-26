// Brings a site made with `npm run new-site` up to this checkout's Cera:
//
//   npm run update-site -- ../my-site
//
// Builds the package, packs it into the site's vendor/cera.tgz, reinstalls it
// there, and copies in any Cera migrations the site doesn't have yet. Then
// run `supabase migration up` in the site for its local database (and
// `supabase db push --linked` for its hosted one).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const folder = process.argv[2];
if (!folder || folder === '--help' || folder === '-h') {
  console.log('Usage: npm run update-site -- <site folder>\n\nUpdates a site made with `npm run new-site` to this checkout of Cera: its package and migrations.');
  process.exit(folder ? 0 : 1);
}
const site = resolve(process.env.INIT_CWD ?? process.cwd(), folder);
if (!existsSync(join(site, 'vendor', 'cera.tgz'))) {
  console.error(`${site} has no vendor/cera.tgz: it wasn't made with \`npm run new-site\`, or uses Cera from npm (update that with npm).`);
  process.exit(1);
}

const run = (label, command, args, cwd) => {
  console.log(`\n${label}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run('Building the package…', process.execPath, [join(root, 'scripts', 'build.mjs')], root);
const packed = mkdtempSync(join(tmpdir(), 'cera-pack-'));
const pack = spawnSync('npm', ['pack', '--json', '--pack-destination', packed], { cwd: root, encoding: 'utf8' });
if (pack.status !== 0) {
  console.error(pack.stderr);
  process.exit(1);
}
copyFileSync(join(packed, JSON.parse(pack.stdout)[0].filename), join(site, 'vendor', 'cera.tgz'));
rmSync(packed, { recursive: true, force: true });
// Reinstalling the same path refreshes the lockfile's checksum for the new tarball.
run('Installing it in the site…', 'npm', ['install', './vendor/cera.tgz'], site);

const ours = join(root, 'supabase', 'migrations');
const theirs = join(site, 'supabase', 'migrations');
const added = readdirSync(ours).filter((file) => file.endsWith('.sql') && !existsSync(join(theirs, file)));
for (const file of added) copyFileSync(join(ours, file), join(theirs, file));
console.log(
  added.length
    ? `\nNew migrations: ${added.join(', ')}.\nApply them: \`npx supabase migration up\` in the site (and \`npx supabase db push --linked\` for its hosted project).`
    : '\nNo new migrations.',
);
console.log('\nUpdated. Look over the changes in the site and commit them.');
