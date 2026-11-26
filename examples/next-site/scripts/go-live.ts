/**
 * Puts the site online, step by step, asking as it goes:
 *
 *   npm run go-live              # does it
 *   npm run go-live -- --dry-run # shows what it would do, changing nothing
 *
 * 1. A Supabase project: an existing one, or a new one it creates.
 * 2. Cera's migrations, applied to it (after showing which).
 * 3. The site's settings in .env.hosted: the project's keys, a preview and a
 *    cron secret, and an SMTP server if you want emails.
 * 4. The first admin account, with a temporary password shown once.
 * 5. A Vercel project with those settings, and a production deploy.
 *
 * Needs the Supabase CLI signed in (`npx supabase login`), and for step 5 the
 * Vercel CLI (`npx vercel login`). Running it again picks up where it
 * stopped: what's in .env.hosted is reused.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';
import { createCeraUser } from '@lateraltranslucence/cera/supabase';
import { goLive, type Io } from '../lib/go-live.ts';

const site = JSON.parse(readFileSync('package.json', 'utf8')) as { name: string };
const has = (command: string) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;

// One reader for the whole run, its lines queued: answers typed (or pasted)
// ahead of their question wait for it, and when input ends, questions take
// their defaults.
const reader = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const lines: string[] = [];
const waiting: Array<(line: string | null) => void> = [];
let ended = false;
reader.on('line', (line) => (waiting.length ? waiting.shift()!(line) : lines.push(line)));
reader.on('close', () => {
  ended = true;
  while (waiting.length) waiting.shift()!(null);
});
const nextLine = () => new Promise<string | null>((resolve) => (lines.length ? resolve(lines.shift()!) : ended ? resolve(null) : waiting.push(resolve)));
let hiding = false;
const output = reader as unknown as { _writeToOutput: (text: string) => void };
const write = output._writeToOutput.bind(reader);
// While hiding, what's typed isn't echoed; the prompt and the line ending still are.
output._writeToOutput = (text: string) => {
  if (!hiding || text === '\r\n' || text === '\n') write(text);
};

const io: Io = {
  run(command, args, options = {}) {
    return new Promise((resolve) => {
      const child = spawn(command, args, { stdio: ['pipe', options.show ? 'inherit' : 'pipe', options.show ? 'inherit' : 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk) => (stdout += chunk));
      child.stderr?.on('data', (chunk) => (stderr += chunk));
      child.on('error', (error) => resolve({ ok: false, stdout, stderr: String(error) }));
      child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr }));
      child.stdin?.end(options.input ?? '');
    });
  },
  async ask(question, options = {}) {
    process.stdout.write(`${question}${options.default ? ` [${options.default}]` : ''} `);
    // What's typed for a secret isn't echoed.
    hiding = options.secret === true;
    const answer = await nextLine();
    hiding = false;
    if (answer === null || !process.stdin.isTTY) process.stdout.write('\n');
    return answer?.trim() || options.default || '';
  },
  say: (text) => console.log(text),
  readFile: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null),
  writeFile: (path, text) => writeFileSync(path, text, { mode: 0o600 }),
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  async createAdmin(env, email) {
    const service = createClient(env.url, env.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await createCeraUser(service, { email, role: 'admin' });
    return result.ok ? { ok: true, password: result.password } : { ok: false, message: result.message };
  },
};

const ok = await goLive(
  {
    name: site.name,
    vercel: has('vercel') ? ['vercel'] : ['npx', '--yes', 'vercel@latest'],
    dryRun: process.argv.includes('--dry-run'),
  },
  io,
);
reader.close();
process.exit(ok ? 0 : 1);
