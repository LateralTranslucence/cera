// Putting a site online (examples/next-site/lib/go-live.ts), with the Supabase
// and Vercel CLIs faked: which commands run, in what order, what's saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENV_FILE, formatEnv, githubPackagesToken, goLive, parseEnv, pickKeys, vercelSettings, type Io, type RunResult } from '../examples/next-site/lib/go-live.ts';

const KEYS = JSON.stringify([
  { name: 'anon', type: 'legacy', api_key: 'legacy-anon' },
  { name: 'service_role', type: 'legacy', api_key: 'legacy-service' },
  { name: 'default', type: 'publishable', api_key: 'sb_publishable_abc' },
  { name: 'default', type: 'secret', api_key: 'sb_secret_xyz' },
]);

/** A fake terminal: answers questions in order, records commands, and answers them from `responses`. */
function fakeIo(answers: string[], responses: (command: string, args: string[]) => Partial<RunResult> | undefined = () => undefined, files: Record<string, string> = {}) {
  const commands: Array<{ line: string; input?: string }> = [];
  const said: string[] = [];
  const questions: string[] = [];
  const admins: string[] = [];
  const io: Io = {
    async run(command, args, options = {}) {
      commands.push({ line: [command, ...args].join(' '), ...(options.input !== undefined && { input: options.input }) });
      return { ok: true, stdout: '', stderr: '', ...responses(command, args) };
    },
    async ask(question, options = {}) {
      questions.push(question);
      const answer = answers.shift();
      return answer === undefined || answer === '' ? (options.default ?? '') : answer;
    },
    say: (text) => said.push(text),
    readFile: (path) => files[path] ?? null,
    writeFile: (path, text) => void (files[path] = text),
    wait: async () => {},
    async createAdmin(_env, email) {
      admins.push(email);
      return { ok: true, password: 'Temp-Password-123' };
    },
  };
  return { io, commands, said, questions, admins, files };
}

const supabase = (command: string, args: string[]): Partial<RunResult> | undefined => {
  if (command !== 'supabase') return undefined;
  const joined = args.join(' ');
  if (joined === 'projects list -o json') return { stdout: JSON.stringify([{ ref: 'abcdefghijklmnop', name: 'my-site', status: 'ACTIVE_HEALTHY' }]) };
  if (joined === 'orgs list -o json') return { stdout: JSON.stringify([{ id: 'org1', name: 'Acme' }]) };
  if (joined.startsWith('projects create')) return { stdout: JSON.stringify({ id: 'abcdefghijklmnop', name: 'my-site' }) };
  if (joined.startsWith('projects api-keys')) return { stdout: KEYS };
  return undefined;
};

const options = { name: 'my-site', ceraDependency: '^0.1.0', npmrc: '//npm.pkg.github.com/:_authToken=ghp_token123\n', vercel: ['vercel'] };

test('env files: round trip, including a value with a newline', () => {
  const values = new Map([['A', 'plain'], ['NPM_RC', 'line one\n//line=two'], ['EMPTY', '']]);
  const text = formatEnv(values, '# comment');
  assert.match(text, /^# comment\nA=plain\nNPM_RC="line one\\n\/\/line=two"\nEMPTY=\n$/);
  assert.deepEqual([...parseEnv(text)], [...values]);
  assert.deepEqual([...parseEnv('X="quoted"\nY=a=b\n# no\nbad line')], [['X', 'quoted'], ['Y', 'a=b']]);
});

test('keys: the new kind first, the legacy ones otherwise, never masked ones', () => {
  assert.deepEqual(pickKeys(KEYS), { publishable: 'sb_publishable_abc', secret: 'sb_secret_xyz' });
  assert.deepEqual(pickKeys(JSON.stringify([{ name: 'anon', api_key: 'a' }, { name: 'service_role', api_key: 's' }])), { publishable: 'a', secret: 's' });
  assert.equal(pickKeys(JSON.stringify([{ type: 'publishable', api_key: 'p' }, { type: 'secret', api_key: 'sb_secret_ab······' }])), null);
  assert.equal(pickKeys('not json'), null);
  assert.equal(githubPackagesToken('registry=x\n//npm.pkg.github.com/:_authToken=ghp_1 \n'), 'ghp_1');
  assert.equal(githubPackagesToken(null), undefined);
});

test('a new site: creates the project, migrates, saves the settings, makes the admin, sets up Vercel and deploys', async () => {
  const fake = fakeIo(['', '', '', 'y', '', 'me@example.com', 'y', 'y'], supabase);
  assert.equal(await goLive(options, fake.io), true);
  const lines = fake.commands.map((command) => command.line.replace(/--db-password \S+/, '--db-password ***'));
  assert.deepEqual(lines, [
    'supabase projects list -o json',
    'supabase orgs list -o json',
    'supabase projects create my-site --org-id org1 --region us-east-1 --db-password *** -o json',
    'supabase projects list -o json',
    'supabase link --project-ref abcdefghijklmnop',
    'supabase db push --linked --dry-run',
    'supabase db push --linked --yes',
    'supabase projects api-keys --project-ref abcdefghijklmnop --reveal -o json',
    'vercel whoami',
    'vercel link --yes --project my-site',
    'vercel env add NEXT_PUBLIC_SUPABASE_URL --environment production,preview --force --no-sensitive --non-interactive',
    'vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --environment production,preview --force --no-sensitive --non-interactive',
    'vercel env add SUPABASE_SECRET_KEY --environment production,preview --force --sensitive --non-interactive',
    'vercel env add CERA_PREVIEW_SECRET --environment production,preview --force --sensitive --non-interactive',
    'vercel env add CRON_SECRET --environment production,preview --force --sensitive --non-interactive',
    'vercel env add NPM_RC --environment production,preview --force --sensitive --non-interactive',
    'vercel deploy --prod',
  ]);
  // Values go on stdin, never on the command line.
  assert.equal(fake.commands.find((command) => command.line.includes('SUPABASE_SECRET_KEY'))?.input, 'sb_secret_xyz');
  assert.equal(fake.commands.find((command) => command.line.includes('NPM_RC'))?.input, '@lateraltranslucence:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=ghp_token123');
  assert.ok(fake.commands.every((command) => !command.line.includes('sb_secret_xyz') && !command.line.includes('ghp_token123')));

  const saved = parseEnv(fake.files[ENV_FILE]!);
  assert.equal(saved.get('NEXT_PUBLIC_SUPABASE_URL'), 'https://abcdefghijklmnop.supabase.co');
  assert.equal(saved.get('SUPABASE_SECRET_KEY'), 'sb_secret_xyz');
  assert.equal(saved.get('CERA_ADMIN_EMAIL'), 'me@example.com');
  assert.ok((saved.get('SUPABASE_DB_PASSWORD') ?? '').length >= 30);
  assert.ok((saved.get('CERA_PREVIEW_SECRET') ?? '').length >= 30);
  assert.notEqual(saved.get('CERA_PREVIEW_SECRET'), saved.get('CRON_SECRET'));
  assert.deepEqual(fake.admins, ['me@example.com']);
  assert.ok(fake.said.some((line) => line.includes('Temp-Password-123')));
});

test('running it again reuses what’s saved: same project, same secrets, no second admin', async () => {
  const first = fakeIo(['', '', '', 'y', '', 'me@example.com', 'n'], supabase);
  await goLive(options, first.io);
  const before = parseEnv(first.files[ENV_FILE]!);
  const again = fakeIo(['y', 'n'], supabase, { ...first.files });
  assert.equal(await goLive(options, again.io), true);
  assert.ok(!again.commands.some((command) => command.line.includes('projects create')));
  assert.deepEqual(again.admins, []);
  const after = parseEnv(again.files[ENV_FILE]!);
  for (const name of ['CERA_PREVIEW_SECRET', 'CRON_SECRET', 'SUPABASE_DB_PASSWORD', 'CERA_ADMIN_EMAIL']) assert.equal(after.get(name), before.get(name), name);
});

test('a dry run changes nothing: only the read-only project list runs, and no file is written', async () => {
  const fake = fakeIo(['', '', '', '', 'me@example.com'], supabase);
  assert.equal(await goLive({ ...options, dryRun: true }, fake.io), true);
  assert.deepEqual(fake.commands.map((command) => command.line), ['supabase projects list -o json', 'supabase orgs list -o json']);
  assert.deepEqual(fake.files, {});
  assert.deepEqual(fake.admins, []);
  const shown = fake.said.join('\n');
  for (const step of ['would run: supabase projects create my-site', 'would run: supabase db push --linked --yes', 'would make me@example.com an admin', 'would run: vercel env add SUPABASE_SECRET_KEY', 'would run: vercel deploy --prod']) {
    assert.ok(shown.includes(step), step);
  }
  assert.ok(!shown.includes('ghp_token123'));
  assert.match(shown, /--db-password \*\*\* /);
});

test('it stops early, saying what to do: not signed in, or Vercel refusing a setting', async () => {
  const signedOut = fakeIo([], () => ({ ok: false, stderr: 'not logged in' }));
  assert.equal(await goLive(options, signedOut.io), false);
  assert.ok(signedOut.said.some((line) => line.includes('supabase login')));
  assert.equal(signedOut.commands.length, 1);

  const refused = fakeIo(['abcdefghijklmnop', 'y', '', 'me@example.com', 'y'], (command, args) =>
    command === 'vercel' && args.includes('SUPABASE_SECRET_KEY') ? { ok: false } : supabase(command, args),
  );
  assert.equal(await goLive(options, refused.io), false);
  assert.ok(refused.said.some((line) => line.includes('SUPABASE_SECRET_KEY') && line.includes('Import .env')));
  assert.ok(!refused.commands.some((command) => command.line.includes('deploy')));
});

test('a site with Cera packed in needs no GitHub Packages token on Vercel', async () => {
  const fake = fakeIo(['abcdefghijklmnop', 'y', '', 'me@example.com', 'y', 'n'], supabase);
  await goLive({ ...options, ceraDependency: 'file:vendor/cera.tgz' }, fake.io);
  assert.ok(!fake.commands.some((command) => command.line.includes('NPM_RC')));
  assert.equal(parseEnv(fake.files[ENV_FILE]!).has('NPM_RC'), false);
  assert.deepEqual(vercelSettings(new Map([['SMTP_URL', ''], ['CRON_SECRET', 'c']])).map((setting) => setting.name), ['CRON_SECRET']);
});
