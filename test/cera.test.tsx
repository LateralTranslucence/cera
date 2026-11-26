import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCera, type CeraOptions } from '../src/next/index.ts';
import { contentTypes } from '../examples/next-site/cera/index.ts';

const NOT_SIGNED_IN = new Error('not signed in');

function cera(overrides: Partial<CeraOptions> = {}) {
  const signedOut: string[] = [];
  const unused = () => {
    throw new Error('no client in this test');
  };
  const options: CeraOptions = {
    contentTypes,
    auth: {
      requireStaff: async () => {
        throw NOT_SIGNED_IN;
      },
      userClient: async () => ({ auth: { signOut: async () => void signedOut.push('signed out') } }) as unknown as SupabaseClient,
    },
    publicClient: unused,
    serviceClient: unused,
    Client: () => null,
    secrets: { preview: () => undefined, cron: () => 'cron secret', forms: () => 'forms secret' },
    ...overrides,
  };
  return { cera: createCera(options), signedOut };
}

const at = (path: string[]) => ({ params: Promise.resolve({ path }) });

/** Runs a screen's server components down to the first element that isn't one (what React would do). */
async function draw(node: unknown): Promise<unknown> {
  let current = await node;
  while (current && typeof current === 'object' && 'type' in current && typeof current.type === 'function' && 'props' in current) {
    current = await (current.type as (props: unknown) => unknown)(current.props);
  }
  return current;
}

test('createCera: the server action runs only the admin actions Cera defines', async () => {
  const { cera: admin } = cera();
  // A real action, which checks who is signed in first.
  await assert.rejects(admin.runAction('findPages', [{ contentType: 'landing_page' }]), NOT_SIGNED_IN);
  for (const name of ['nope', 'constructor', 'toString', '__proto__', 'hasOwnProperty', '']) {
    await assert.rejects(admin.runAction(name, []), /has no admin action/, name);
  }
});

test('createCera: routes go to the handler at their address, by method', async () => {
  const { cera: admin, signedOut } = cera();
  const request = (path: string, method = 'GET') => new Request(`http://localhost/api/cera/${path}`, { method });

  assert.equal((await admin.routes.GET(request('nope'), at(['nope']))).status, 404);
  assert.equal((await admin.routes.GET(request('search/more'), at(['search', 'more']))).status, 404);
  assert.equal((await admin.routes.GET(request(''), at([]))).status, 404);
  // Inherited names aren't routes either.
  assert.equal((await admin.routes.GET(request('constructor'), at(['constructor']))).status, 404);

  const wrongMethod = await admin.routes.POST(request('search', 'POST'), at(['search']));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('Allow'), 'GET');
  assert.equal((await admin.routes.GET(request('sign-out'), at(['sign-out']))).status, 405);

  // Outside tools' preview needs the secret; none is set, so nothing gets in.
  assert.equal((await admin.routes.GET(request('draft?slug=about'), at(['draft']))).status, 401);
  // Cleanup needs the cron secret.
  assert.equal((await admin.routes.GET(request('cleanup'), at(['cleanup']))).status, 401);
  // The CSV and the admin's preview need someone signed in.
  await assert.rejects(admin.routes.GET(request('submissions.csv'), at(['submissions.csv'])), NOT_SIGNED_IN);
  await assert.rejects(admin.routes.GET(request('preview?slug=about'), at(['preview'])), NOT_SIGNED_IN);

  const out = await admin.routes.POST(request('sign-out', 'POST'), at(['sign-out']));
  assert.equal(out.status, 303);
  assert.equal(out.headers.get('Location'), '/admin/login');
  assert.deepEqual(signedOut, ['signed out']);
});

test('createCera: a site screen may not take one of Cera’s addresses', () => {
  const screen = { title: 'Mine', render: () => null };
  for (const key of ['login', 'settings', 'media', 'pages', 'forms']) {
    assert.throws(() => cera({ screens: { [key]: screen } }), /same address/, key);
  }
  assert.doesNotThrow(() => cera({ screens: { team: screen } }));
});

test('createCera: screens need someone signed in, and each has a title', async () => {
  const { cera: admin } = cera({ screens: { team: { title: (path) => `Team: ${path.join('/')}`, render: () => null } } });
  for (const path of [['account'], ['settings'], ['media'], ['submissions'], ['pages'], ['pages', 'new'], ['team', 'about']]) {
    await assert.rejects(draw(admin.Page({ ...at(path), searchParams: Promise.resolve({}) })), NOT_SIGNED_IN, path.join('/'));
  }
  // Signing in is the one screen without a session.
  assert.ok(await admin.Page({ ...at(['login']), searchParams: Promise.resolve({ error: 'no-role' }) }));

  assert.deepEqual(await admin.generateMetadata(at(['login'])), { title: 'Sign in' });
  assert.deepEqual(await admin.generateMetadata(at(['team', 'about'])), { title: 'Team: about' });
  assert.deepEqual(await admin.generateMetadata(at(['settings'])), { title: 'Settings' });
});
