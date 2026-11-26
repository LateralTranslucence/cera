// Refreshes template/ from the repository's example site (examples/next-site)
// and Supabase setup, so a new site starts as the example does, minus what is
// only for this repository (the Developers Only import, the workspace build
// steps). Runs before packing; template/ isn't committed.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(here, '..', '..');
const example = join(repo, 'examples', 'next-site');
const template = join(here, 'template');

const LEFT_OUT = new Set(['README.md', 'package.json', 'next.config.ts', 'scripts/import-developers-only.ts']);

rmSync(template, { recursive: true, force: true });

// The example's files that git tracks or would (so nothing ignored, like .env.local, is copied).
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: example, encoding: 'utf8' }).split('\n').filter(Boolean);
for (const file of files) {
  if (LEFT_OUT.has(file)) continue;
  mkdirSync(dirname(join(template, file)), { recursive: true });
  copyFileSync(join(example, file), join(template, file));
}

// Supabase: the stack's settings and Cera's migrations.
mkdirSync(join(template, 'supabase', 'migrations'), { recursive: true });
copyFileSync(join(repo, 'supabase', 'config.toml'), join(template, 'supabase', 'config.toml'));
for (const migration of readdirSync(join(repo, 'supabase', 'migrations'))) {
  if (migration.endsWith('.sql')) copyFileSync(join(repo, 'supabase', 'migrations', migration), join(template, 'supabase', 'migrations', migration));
}

// package.json: no workspace build steps or repository-only scripts, and Cera from npm.
const site = JSON.parse(readFileSync(join(example, 'package.json'), 'utf8'));
const cera = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
const scripts = {};
for (const [name, command] of Object.entries(site.scripts)) {
  if (name.startsWith('pre') || name === 'dev:site' || name === 'import:devo') continue;
  scripts[name] = command.replace(' --conditions=source', '');
}
writeFileSync(
  join(template, 'package.json'),
  `${JSON.stringify(
    {
      name: '__NAME__',
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts,
      dependencies: { ...site.dependencies, '@lateraltranslucence/cera': `^${cera.version}` },
      devDependencies: site.devDependencies,
    },
    null,
    2,
  )}\n`,
);

writeFileSync(
  join(template, 'next.config.ts'),
  `import type { NextConfig } from 'next';\n\nconst config: NextConfig = {};\n\nexport default config;\n`,
);

// Where @lateraltranslucence packages come from: Cera is published privately
// to GitHub Packages. npm leaves .npmrc out of packages, so it travels as
// "npmrc"; create-cera renames it. Sign-in stays in the user's own ~/.npmrc.
writeFileSync(join(template, 'npmrc'), '@lateraltranslucence:registry=https://npm.pkg.github.com\n');

// npm leaves .gitignore files out of packages, so it travels as "gitignore".
writeFileSync(join(template, 'gitignore'), ['node_modules', '.next', 'next-env.d.ts', '.env*', '!.env.example', 'supabase/.branches', 'supabase/.temp', '*.tsbuildinfo', '.vercel', ''].join('\n'));

writeFileSync(
  join(template, 'README.md'),
  `# __NAME__

A Next.js site built on [Cera](https://github.com/LateralTranslucence/cera): pages made of panels, edited in the admin at /admin, stored in Supabase.

## Run it locally

Needs Node 22, Docker and the Supabase CLI. Making the site (\`npm init @lateraltranslucence/cera\` or \`npm run new-site\`) already ran the first four steps; run them again on another computer, or after \`supabase stop --no-backup\`.

\`\`\`bash
npm install
supabase start      # a local Supabase stack on ports 56320–56329, with Cera's migrations applied
npm run env         # writes .env.local from \`supabase status\`
npm run seed        # an admin account, a few example pages and the menus
npm run dev         # http://localhost:3100, admin at /admin
\`\`\`

Sign in to the admin with \`CERA_ADMIN_EMAIL\` / \`CERA_ADMIN_PASSWORD\` from \`.env.local\`.

## Where things are

- \`cera/\`: the content types (landing pages, simple pages, admin pages) and the background palette.
- \`app/(site)\`: the public site; \`app/admin\`: the admin screens; \`app/api\`: forms, search, preview and cleanup.
- \`lib/\`: sign-in, Supabase clients, page loading and icon sets.
- \`supabase/migrations\`: Cera's database. Newer Cera versions ship new migrations; copy them in and run \`supabase migration up\`.

## Cera's package

Cera is published privately to GitHub Packages (\`.npmrc\` says where \`@lateraltranslucence\` packages come from). Installing it needs a GitHub token that can read packages, once per computer: create a classic personal access token with \`read:packages\` at https://github.com/settings/tokens and add it to your own \`~/.npmrc\` (not this site's):

\`\`\`
//npm.pkg.github.com/:_authToken=<your token>
\`\`\`

A site made from a Cera checkout (\`npm run new-site\`) has Cera in \`vendor/cera.tgz\` instead, and needs no token. Update Cera with \`npm install @lateraltranslucence/cera@latest\`, and copy in any new files from its \`supabase/migrations\`.

## Deploy

\`npm run go-live\` puts the site online, asking as it goes: it creates (or uses) a Supabase project, applies Cera's migrations, makes your admin account, and sets up a Vercel project with the site's settings, then deploys. It needs \`supabase login\` and \`npx vercel login\` first, and keeps the hosted settings in \`.env.hosted\` (never committed). \`npm run go-live -- --dry-run\` shows every step without changing anything; running it again picks up where it stopped.

To do it by hand instead: set \`NEXT_PUBLIC_SUPABASE_URL\`, \`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\`, \`SUPABASE_SECRET_KEY\`, \`CERA_PREVIEW_SECRET\` and \`CRON_SECRET\` for the hosted project, push the migrations with \`supabase db push\`, and deploy. \`vercel.json\` runs the daily cleanup on Vercel. On Vercel, also set \`NPM_RC\` (so its install can fetch Cera) to these two lines, with a token that can read packages:

\`\`\`
@lateraltranslucence:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<token>
\`\`\`
`,
);

console.log(`template/ synced: ${files.length - LEFT_OUT.size} site files and the migrations.`);
