/**
 * Putting the site online: a hosted Supabase project with Cera's database, an
 * admin account, and a Vercel project with the site's settings. The steps
 * run the Supabase and Vercel command-line tools as the person running them
 * (`supabase login`, `vercel login`), so this file holds no credentials.
 *
 * Everything that talks to the outside goes through `Io`, so a dry run (and
 * the tests) can walk the same steps without creating anything.
 */
import { randomBytes } from 'node:crypto';

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export interface Io {
  /** Runs a command; `input` goes to its stdin. `show` streams its output to the terminal. */
  run(command: string, args: string[], options?: { input?: string; show?: boolean }): Promise<RunResult>;
  /** Asks a question; the default is used when the answer is empty. `secret` hides what's typed. */
  ask(question: string, options?: { default?: string; secret?: boolean }): Promise<string>;
  /** Shows a line. */
  say(text: string): void;
  readFile(path: string): string | null;
  writeFile(path: string, text: string): void;
  /** Waits, between checks on a project being set up. */
  wait(milliseconds: number): Promise<void>;
  /** Creates the admin account with the project's secret key. */
  createAdmin(env: { url: string; secretKey: string }, email: string): Promise<{ ok: true; password: string } | { ok: false; message: string }>;
}

export interface GoLiveOptions {
  /** The site's npm name: the default project name. */
  name: string;
  /** The site's dependency on Cera, from package.json: decides whether Vercel needs a token for GitHub Packages. */
  ceraDependency: string;
  /** The user's ~/.npmrc, for its GitHub Packages token. */
  npmrc?: string | null;
  /** How to run the Vercel CLI: `vercel` when it's installed, else `npx --yes vercel@latest`. */
  vercel: string[];
  /** Print the commands instead of running anything that changes something. */
  dryRun?: boolean;
}

export const ENV_FILE = '.env.hosted';

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

/** KEY=value lines, in order. Quotes around a value are removed. */
export function parseEnv(text: string | null): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of (text ?? '').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const raw = match[2]!;
    // Quoted values are JSON strings (formatEnv writes them so), which keeps newlines.
    if (/^".*"$/.test(raw)) {
      try {
        values.set(match[1]!, JSON.parse(raw) as string);
        continue;
      } catch {}
    }
    values.set(match[1]!, raw);
  }
  return values;
}

/** The env file's text: a comment, then KEY=value lines. Values with spaces or newlines are quoted. */
export function formatEnv(values: Map<string, string>, comment: string): string {
  const lines = [...values].map(([key, value]) => `${key}=${/[\s#"']/.test(value) ? JSON.stringify(value) : value}`);
  return `${comment}\n${lines.join('\n')}\n`;
}

/** A random value for secrets the site makes up itself (preview, cron, database password). */
export function randomSecret(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

/** The project's public and secret keys from `supabase projects api-keys -o json`: the new kind, or the legacy ones. */
export function pickKeys(json: string): { publishable: string; secret: string } | null {
  let keys: Array<{ name?: string; type?: string; api_key?: string }>;
  try {
    keys = JSON.parse(json);
  } catch {
    return null;
  }
  const find = (test: (key: { name?: string; type?: string }) => boolean) => keys.find(test)?.api_key;
  const publishable = find((key) => key.type === 'publishable') ?? find((key) => key.name === 'anon');
  const secret = find((key) => key.type === 'secret') ?? find((key) => key.name === 'service_role');
  return publishable && secret && !secret.includes('·') ? { publishable, secret } : null;
}

/** The token for GitHub Packages in an .npmrc, if there is one. */
export function githubPackagesToken(npmrc: string | null | undefined): string | undefined {
  return /^\/\/npm\.pkg\.github\.com\/:_authToken=(.+)$/m.exec(npmrc ?? '')?.[1]?.trim();
}

/** The settings Vercel needs, in order: name, value, and whether it's secret (hidden in Vercel's dashboard). */
export function vercelSettings(env: Map<string, string>): Array<{ name: string; value: string; secret: boolean }> {
  const settings: Array<{ name: string; secret: boolean }> = [
    { name: 'NEXT_PUBLIC_SUPABASE_URL', secret: false },
    { name: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', secret: false },
    { name: 'SUPABASE_SECRET_KEY', secret: true },
    { name: 'CERA_PREVIEW_SECRET', secret: true },
    { name: 'CRON_SECRET', secret: true },
    { name: 'NPM_RC', secret: true },
    { name: 'SMTP_URL', secret: true },
    { name: 'CERA_EMAIL_FROM', secret: false },
  ];
  return settings.flatMap((setting) => (env.get(setting.name) ? [{ ...setting, value: env.get(setting.name)! }] : []));
}

const yes = (answer: string) => /^y(es)?$/i.test(answer.trim());

/* ------------------------------------------------------------------ */
/* The steps                                                           */
/* ------------------------------------------------------------------ */

export async function goLive(options: GoLiveOptions, io: Io): Promise<boolean> {
  const dry = options.dryRun === true;
  const env = parseEnv(io.readFile(ENV_FILE));
  const save = () =>
    io.writeFile(ENV_FILE, formatEnv(env, `# The hosted site's settings, written by \`npm run go-live\`. Secret: never commit this file.`));

  /** Runs a command that changes something; in a dry run, only shows it. */
  const change = async (command: string, args: string[], extra: { input?: string; show?: boolean; label?: string } = {}): Promise<RunResult> => {
    if (dry) {
      // Passwords on the command line are shown as ***.
      const shown = args.map((arg, index) => (args[index - 1] === '--db-password' ? '***' : arg));
      io.say(`  would run: ${[command, ...shown].join(' ')}${extra.input !== undefined ? ' (value on stdin)' : ''}`);
      return { ok: true, stdout: '', stderr: '' };
    }
    return io.run(command, args, extra);
  };

  io.say(dry ? 'Dry run: nothing is created or changed.\n' : '');

  // 1. Supabase: signed in, and a project.
  io.say('1. Supabase');
  const projects = await io.run('supabase', ['projects', 'list', '-o', 'json']);
  if (!projects.ok) {
    io.say('   The Supabase CLI isn’t signed in, or isn’t installed. Run `supabase login`, then run this again.');
    return false;
  }
  let ref = env.get('NEXT_PUBLIC_SUPABASE_URL')?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  if (ref) {
    io.say(`   Using the project in ${ENV_FILE}: ${ref}.`);
  } else {
    const list = JSON.parse(projects.stdout || '[]') as Array<{ id?: string; ref?: string; name?: string }>;
    if (list.length) io.say(`   Your projects: ${list.map((project) => `${project.name} (${project.ref ?? project.id})`).join(', ')}.`);
    const answer = (await io.ask('   Use an existing project? Its ref, or leave empty to create one:', { default: '' })).trim();
    if (answer) {
      ref = answer;
    } else {
      const orgs = JSON.parse((await io.run('supabase', ['orgs', 'list', '-o', 'json'])).stdout || '[]') as Array<{ id: string; name: string }>;
      const org = orgs.length === 1 ? orgs[0]!.id : await io.ask(`   Which organization? (${orgs.map((each) => `${each.name}: ${each.id}`).join(', ')})`);
      const name = await io.ask('   Project name:', { default: options.name });
      const region = await io.ask('   Region:', { default: 'us-east-1' });
      const password = env.get('SUPABASE_DB_PASSWORD') ?? randomSecret();
      env.set('SUPABASE_DB_PASSWORD', password);
      if (!dry) save();
      io.say(`   Creating ${name} in ${region} (the database password is kept in ${ENV_FILE})…`);
      const created = await change('supabase', ['projects', 'create', name, '--org-id', org, '--region', region, '--db-password', password, '-o', 'json']);
      if (!created.ok) {
        io.say(`   Couldn’t create it:\n${created.stderr}`);
        return false;
      }
      ref = dry ? '<project-ref>' : (JSON.parse(created.stdout) as { id?: string; ref?: string }).ref ?? (JSON.parse(created.stdout) as { id: string }).id;
      // A new project takes a minute or two before it takes connections.
      for (let tries = 0; !dry && tries < 60; tries++) {
        const status = (JSON.parse((await io.run('supabase', ['projects', 'list', '-o', 'json'])).stdout || '[]') as Array<{ ref?: string; id?: string; status?: string }>).find(
          (project) => (project.ref ?? project.id) === ref,
        )?.status;
        if (status === 'ACTIVE_HEALTHY') break;
        if (tries === 0) io.say('   Waiting for it to start…');
        await io.wait(10_000);
      }
    }
    env.set('NEXT_PUBLIC_SUPABASE_URL', `https://${ref}.supabase.co`);
  }

  // 2. Cera's database.
  io.say('\n2. Database');
  if (!(await change('supabase', ['link', '--project-ref', ref!], { show: true })).ok) {
    io.say('   Couldn’t link the project (see above).');
    return false;
  }
  const pending = await change('supabase', ['db', 'push', '--linked', '--dry-run'], { show: true });
  if (!pending.ok) return false;
  if (dry || yes(await io.ask('   Apply these migrations? (y/n)', { default: 'y' }))) {
    if (!(await change('supabase', ['db', 'push', '--linked', '--yes'], { show: true })).ok) {
      io.say('   The migrations failed (see above). Nothing after them ran.');
      return false;
    }
  }

  // 3. Keys and the site's own secrets.
  io.say('\n3. Settings');
  if (dry) {
    for (const name of ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY']) if (!env.get(name)) env.set(name, `<${name.toLowerCase()}>`);
  } else {
    const keys = pickKeys((await io.run('supabase', ['projects', 'api-keys', '--project-ref', ref!, '--reveal', '-o', 'json'])).stdout);
    if (!keys) {
      io.say('   Couldn’t read the project’s API keys. Check `supabase projects api-keys` works, then run this again.');
      return false;
    }
    env.set('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', keys.publishable);
    env.set('SUPABASE_SECRET_KEY', keys.secret);
  }
  if (!env.get('CERA_PREVIEW_SECRET')) env.set('CERA_PREVIEW_SECRET', randomSecret());
  if (!env.get('CRON_SECRET')) env.set('CRON_SECRET', randomSecret());
  if (!options.ceraDependency.startsWith('file:') && !env.get('NPM_RC')) {
    // Vercel installs Cera from GitHub Packages, so it needs a token that can read packages.
    const token = githubPackagesToken(options.npmrc) ?? (await io.ask('   A GitHub token that can read packages, for Vercel to install Cera (read:packages):', { secret: true }));
    if (token) env.set('NPM_RC', `@lateraltranslucence:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=${token}`);
  }
  if (!env.has('SMTP_URL')) {
    const smtp = await io.ask('   An SMTP server for form and approval emails (smtp://user:password@host:port), or leave empty for none:', { default: '', secret: true });
    if (smtp) {
      env.set('SMTP_URL', smtp);
      env.set('CERA_EMAIL_FROM', await io.ask('   Emails come from:', { default: `${options.name} <no-reply@example.com>` }));
    } else env.set('SMTP_URL', '');
  }
  if (!dry) save();
  io.say(dry ? `   would write ${ENV_FILE}` : `   Saved to ${ENV_FILE} (not committed: .env* is ignored).`);

  // 4. The first admin.
  io.say('\n4. Admin account');
  if (env.get('CERA_ADMIN_EMAIL')) {
    io.say(`   ${env.get('CERA_ADMIN_EMAIL')} was set up before.`);
  } else {
    const email = (await io.ask('   Your email, for the first admin account:')).trim();
    if (email && !dry) {
      const admin = await io.createAdmin({ url: env.get('NEXT_PUBLIC_SUPABASE_URL')!, secretKey: env.get('SUPABASE_SECRET_KEY')! }, email);
      if (admin.ok) {
        env.set('CERA_ADMIN_EMAIL', email);
        save();
        io.say(`   Made ${email} an admin. Temporary password, shown once: ${admin.password}\n   Change it under Account after signing in.`);
      } else io.say(`   ${admin.message}`);
    } else if (email) io.say(`   would make ${email} an admin, with a temporary password shown once`);
  }

  // 5. Vercel.
  io.say('\n5. Vercel');
  if (!dry && !yes(await io.ask('   Set up the Vercel project and its settings now? (y/n)', { default: 'y' }))) {
    io.say(`   Skipped. In Vercel, import ${ENV_FILE} under Settings → Environment Variables (Import .env).`);
    return true;
  }
  const [vercel, ...vercelArgs] = options.vercel;
  if (!dry && !(await io.run(vercel!, [...vercelArgs, 'whoami'])).ok) {
    io.say('   The Vercel CLI isn’t signed in. Run `npx vercel login`, then run this again (finished steps are skipped).');
    return false;
  }
  if (!(await change(vercel!, [...vercelArgs, 'link', '--yes', '--project', options.name], { show: true })).ok) {
    io.say('   Couldn’t link a Vercel project (see above).');
    return false;
  }
  const failed: string[] = [];
  for (const setting of vercelSettings(env)) {
    const result = await change(
      vercel!,
      [...vercelArgs, 'env', 'add', setting.name, '--environment', 'production,preview', '--force', setting.secret ? '--sensitive' : '--no-sensitive', '--non-interactive'],
      { input: setting.value },
    );
    if (!result.ok) failed.push(setting.name);
  }
  if (failed.length) {
    io.say(`   Vercel didn’t take: ${failed.join(', ')}. Add them from ${ENV_FILE} under Settings → Environment Variables (Import .env).`);
    return false;
  }
  io.say(`   ${vercelSettings(env).length} settings ${dry ? 'would be added' : 'added'} for production and previews.`);
  if (dry || yes(await io.ask('   Deploy to production now? (y/n)', { default: 'y' }))) {
    if (!(await change(vercel!, [...vercelArgs, 'deploy', '--prod'], { show: true })).ok) {
      io.say('   The deploy failed (see above).');
      return false;
    }
  }
  io.say(`\nDone. Sign in at <your site>/admin${env.get('CERA_ADMIN_EMAIL') ? ` as ${env.get('CERA_ADMIN_EMAIL')}` : ''}.`);
  return true;
}
