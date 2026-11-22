// A content type is its definition, a view and one line (decision 41): the
// admin's places come from `editor`, public addresses from `route`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminNounOf, adminNounPluralOf, adminPathOf, adminTitleOf, defineContentType, matchRoute, plainText, pluralize, readPage } from '../src/index.ts';
import { formType } from '../src/forms/index.ts';
import { iconType } from '../src/icons/index.ts';
import { createAdminScreens, createPreviewHandler, defineViews, jsonLdString } from '../src/next/index.ts';
import { adminPage } from '../examples/next-site/cera/content-types/admin-page.ts';
import { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';
import { simplePage } from '../examples/next-site/cera/content-types/simple-page.ts';

const caseStudy = defineContentType({ name: 'case_study', label: 'Case Study', route: '/case-studies/[slug]', boxes: {} });
const note = defineContentType({ name: 'note', label: 'Note', boxes: {} });

test('pluralize: -s, -es, consonant + y', () => {
  assert.deepEqual(['Simple Page', 'Case Study', 'Box', 'Day', 'Search', 'Gallery'].map(pluralize), ['Simple Pages', 'Case Studies', 'Boxes', 'Days', 'Searches', 'Galleries']);
});

test('admin places: from the label by default, editor settings when given; the example keeps its addresses', () => {
  assert.equal(adminPathOf(caseStudy), 'case-studies');
  assert.equal(adminTitleOf(caseStudy), 'Case Studies');
  assert.equal(adminNounOf(caseStudy), 'case study');
  assert.equal(adminNounPluralOf(caseStudy), 'case studies');
  assert.deepEqual(
    [landingPage, simplePage, formType, iconType, adminPage].map((contentType) => [adminPathOf(contentType), adminTitleOf(contentType), adminNounOf(contentType)]),
    [
      ['pages', 'Pages', 'page'],
      ['simple-pages', 'Simple Pages', 'simple page'],
      ['forms', 'Forms', 'form'],
      ['icons', 'Icons', 'icon'],
      ['admin-pages', 'Admin Pages', 'admin page'],
    ],
  );
});

test('createAdminScreens: two types at one address are refused; titles come from the type', () => {
  const options = { requireStaff: async () => assert.fail('not called'), Editor: () => null };
  const twin = defineContentType({ name: 'other_case_study', label: 'Case Study', boxes: {} });
  assert.throws(() => createAdminScreens({ ...options, contentTypes: [caseStudy, twin] }), /both live at \/admin\/case-studies/);

  const admin = createAdminScreens({ ...options, contentTypes: [landingPage, caseStudy, note] });
  assert.equal(admin.homePath, '/admin/pages');
  assert.equal(admin.listHref(note), '/admin/notes');
  assert.deepEqual(
    [admin.metadataFor('case-studies', 'list'), admin.metadataFor('case-studies', 'new'), admin.metadataFor('pages', 'edit'), admin.metadataFor('nothing', 'list')],
    [{ title: 'Case Studies' }, { title: 'New case study' }, { title: 'Edit page' }, { title: 'Not found' }],
  );
});

test('matchRoute: the home page, shared routes, prefixed routes, and addresses nothing serves', () => {
  const types = [landingPage, simplePage, caseStudy, note] as const;
  const names = (path: string) => {
    const match = matchRoute(types, path);
    return match && { types: match.types.map((contentType) => contentType.name), slug: match.slug };
  };
  assert.deepEqual(names('/'), { types: ['landing_page', 'simple_page'], slug: 'home' });
  assert.deepEqual(names('/about'), { types: ['landing_page', 'simple_page'], slug: 'about' });
  assert.deepEqual(names('/case-studies/acme'), { types: ['case_study'], slug: 'acme' });
  assert.deepEqual(matchRoute(types, ['case-studies', 'acme'])?.slug, 'acme');
  // The prefix alone is a /[slug] address (a landing page could be called that).
  assert.deepEqual(names('/case-studies'), { types: ['landing_page', 'simple_page'], slug: 'case-studies' });
  // Nothing at a deeper address, a different prefix, or a slug Cera couldn't have saved.
  for (const path of ['/about/team', '/guides/acme', '/About', '/a_b']) assert.equal(names(path), null, path);
  // Without a type at /[slug], there's no home page.
  assert.equal(matchRoute([caseStudy], '/'), null);
});

test('defineViews: routed types, a view per type, and a clear error for one without', () => {
  const View = () => null;
  const views = defineViews([landingPage, caseStudy, note] as const, { landing_page: View });
  assert.deepEqual(
    views.routedTypes.map((contentType) => contentType.name),
    ['landing_page', 'case_study'],
  );
  assert.equal(views.viewFor('landing_page'), View);
  assert.equal(views.typeOf('note'), note);
  assert.throws(() => views.viewFor('case_study'), /"case_study" has a route but no view\. Add one to defineViews: \{ case_study: CaseStudyView \}/);
  assert.throws(() => views.typeOf('missing'), /no content type "missing"/);
});

test('plainText: block tags become spaces, inline tags go, entities are decoded, maxLength cuts', () => {
  assert.equal(plainText('<p>One</p><p>Two <em>red</em>,</p>'), 'One Two red,');
  assert.equal(plainText('<ul><li>A</li><li>B</li></ul>'), 'A B');
  assert.equal(plainText('Fish &amp; chips &lt;3 &#8217; &#x2014; &nbsp;done &bogus;'), 'Fish & chips <3 ’ — done &bogus;');
  assert.equal(plainText('<p>Hello world</p>', 5), 'Hello');
  assert.equal(plainText(undefined), '');
});

test('jsonLdString: adds schema.org’s context unless the definition gives one', () => {
  const page = readPage(simplePage, { id: crypto.randomUUID(), contentType: 'simple_page', slug: 'about', title: 'About', boxes: { content: { description: '<p>Hi &amp; bye</p>' } }, panels: [] }, { status: 'published' }).page;
  assert.deepEqual(JSON.parse(jsonLdString(simplePage, page)!), { '@context': 'https://schema.org', '@type': 'WebPage', headline: 'About', description: 'Hi & bye' });
  const own = defineContentType({ name: 'own', label: 'Own', boxes: {}, jsonLd: () => ({ '@context': 'https://example.org', '@type': 'Thing' }) });
  assert.equal(JSON.parse(jsonLdString(own, { ...page, contentType: 'own' } as never)!)['@context'], 'https://example.org');
});

test('preview: ?path= must be a path on this site', async () => {
  const allowed = createPreviewHandler({ authorize: () => true });
  for (const path of ['//evil.example', 'https://evil.example/', '/\\evil.example', 'about', '']) {
    assert.equal((await allowed.GET(new Request(`http://localhost/admin/preview?path=${encodeURIComponent(path)}`))).status, 400, path);
  }
});
