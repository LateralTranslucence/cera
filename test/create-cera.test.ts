// create-cera: the ports a new site gets, and how its files are rewritten for them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blockPorts, dockerPlan, envValue, movePorts, packageName, pickDevPort, pickPortBlock, portIsFree, shellQuote, siteSupabaseConfig } from '../packages/create-cera/lib.mjs';
import { SUPABASE_CLI_VERSION } from '../packages/create-cera/lib.mjs';

test('a port block is ten ports, 5xx20 to 5xx29', () => {
  assert.deepEqual(blockPorts(571), [57120, 57121, 57122, 57123, 57124, 57125, 57126, 57127, 57128, 57129]);
});

test('the first block whose ten ports are all free, never Supabase’s or Cera’s', async () => {
  const busy = new Set([57025, 57120]);
  assert.equal(await pickPortBlock(async (port) => !busy.has(port)), 572);
  assert.equal(await pickPortBlock(async () => true, { from: 562, to: 564 }), 562);
  assert.equal(await pickPortBlock(async (port) => Math.floor(port / 100) === 563, { from: 562, to: 564 }), null);
  assert.equal(await pickDevPort(async (port) => port > 3103), 3104);
  assert.equal(await pickDevPort(async () => false), null);
});

test('portIsFree sees a port something listens on', async () => {
  const { createServer } = await import('node:net');
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
  const { port } = server.address() as { port: number };
  assert.equal(await portIsFree(port), false);
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await portIsFree(port), true);
});

test('files move to the new ports; other numbers stay', () => {
  const text = 'API http://127.0.0.1:56321, studio 56323, dev --port 3100, not 31000, 456321 or 5632';
  assert.equal(movePorts(text, { block: 574, devPort: 3107 }), 'API http://127.0.0.1:57421, studio 57423, dev --port 3107, not 31000, 456321 or 5632');
});

test('the Supabase settings: own project id, every port in the block, the inspector too', () => {
  const config = siteSupabaseConfig(readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8'), { name: 'my-site', block: 574, devPort: 3107 });
  assert.match(config, /^project_id = "my-site"$/m);
  assert.match(config, /^inspector_port = 57428$/m);
  const ports = [...config.matchAll(/^\s*(?:\w+_)?port = (\d+)$/gm)].map((match) => Number(match[1]));
  assert.ok(ports.length >= 8);
  for (const port of ports) assert.equal(Math.floor(port / 100), 574, `port ${port}`);
  assert.doesNotMatch(config, /\b563\d\d\b/);
});

test('names, shell quoting and env values', () => {
  assert.deepEqual(['My Site', '.hidden', '--', 'ok-site_2'].map(packageName), ['my-site', 'hidden', 'cera-site', 'ok-site_2']);
  assert.equal(shellQuote('../my-site'), '../my-site');
  assert.equal(shellQuote("Bob's site"), "'Bob'\\''s site'");
  assert.equal(envValue('A=1\nCERA_ADMIN_EMAIL=admin@cera.test\n', 'CERA_ADMIN_EMAIL'), 'admin@cera.test');
  assert.equal(envValue('B="quoted"', 'B'), 'quoted');
  assert.equal(envValue('', 'C'), undefined);
});

test('Docker: running, started, installed on a yes, or downloaded', () => {
  const mac = { platform: 'darwin', running: false, cliInstalled: false };
  assert.deepEqual(dockerPlan({ ...mac, running: true }), { action: 'ready' });
  assert.deepEqual(dockerPlan({ ...mac, apps: ['Docker'] }), { action: 'start', app: 'Docker' });
  // OrbStack, when it's there, is what was chosen over Docker Desktop.
  assert.deepEqual(dockerPlan({ ...mac, apps: ['Docker', 'OrbStack'] }), { action: 'start', app: 'OrbStack' });
  assert.deepEqual(dockerPlan({ ...mac, hasBrew: true, interactive: true }), { action: 'install' });
  // Never installed without someone to say yes, or without Homebrew.
  assert.equal(dockerPlan({ ...mac, hasBrew: true, interactive: false }).action, 'download');
  assert.equal(dockerPlan({ ...mac, hasBrew: false, interactive: true }).action, 'download');
  assert.deepEqual(dockerPlan({ platform: 'linux', running: false, cliInstalled: true }), { action: 'manual' });
  assert.match((dockerPlan({ platform: 'win32', running: false, cliInstalled: false }) as { url: string }).url, /windows-install/);
  assert.match((dockerPlan({ platform: 'freebsd', running: false, cliInstalled: false }) as { url: string }).url, /engine\/install/);
});

test('new sites bring their own Supabase CLI, on the tested major version', () => {
  assert.match(SUPABASE_CLI_VERSION, /^\^2\./);
});
