// Ported from DO_Landing_Page (class-landing-page.php).
import { defineContentType, field, plainText } from '@lateraltranslucence/cera';
import { corePanels } from '@lateraltranslucence/cera/panels';

export const landingPage = defineContentType({
  name: 'landing_page',
  label: 'Landing Page',
  route: '/[slug]', // theme: rewrite rule '[^/]+/?$' with no post type slug
  url: (page) => (page.slug === 'home' ? '/' : `/${page.slug}`), // the home page lives at /

  boxes: {
    hero: {
      title: field.text(),
      background: field.background(),
      copy: field.html(),
      ctas: field.ctas({ label: 'CTA' }),
    },
    seo: {
      title: field.text({ label: 'SEO Title', maxLength: 60, note: 'Overwrites page "Title" field for SEO use.' }),
      description: field.textarea({ label: 'SEO Description', maxLength: 160, note: 'Overwrites hero "Copy" field for SEO use.' }),
      image: field.media({ label: 'SEO Image', accept: ['image'] }),
    },
    admin: {
      hidden: field.toggle(),
      noindex: field.toggle({ label: 'NoIndex' }),
      css: field.text(),
      pageType: field.select({ label: 'Landing Page Type', options: { 'landing-page': 'Landing Page', form: 'Form' }, default: 'landing-page' }),
      schemaType: field.select({
        label: 'Schema',
        options: { WebPage: 'WebPage (default)', AboutPage: 'AboutPage', ContactPage: 'ContactPage', SearchResultsPage: 'SearchResultsPage' },
        default: 'WebPage',
      }),
      breadcrumbs: field.repeater({ itemTitle: 'text', fields: { text: field.text(), url: field.url() } }),
    },
  },

  // Every core panel (cera/…). A site's own panels go here too, under their own names.
  panels: corePanels,

  // Admin settings sit with title and slug; the hero renders like a panel, so it sits with them.
  // The admin's Pages: /admin/pages, first in the sidebar.
  editor: { path: 'pages', title: 'Pages', icon: 'pages', noun: 'page', pageBoxes: ['admin'], leadBoxes: ['hero'] },

  seo: {
    title: (page) => page.boxes.seo.title || page.title,
    description: (page) => page.boxes.seo.description || plainText(page.boxes.hero.copy),
    image: (page) => page.boxes.seo.image,
    noindex: (page) => page.boxes.admin.noindex,
  },

  jsonLd: (page) => ({
    '@type': page.boxes.admin.schemaType,
    headline: page.title,
    description: page.boxes.seo.description,
  }),

  hidden: (page) => page.boxes.admin.hidden,

  // Each page's own breadcrumbs (the Admin box), after the type's (none here).
  pageBreadcrumbs: (page) => page.boxes.admin.breadcrumbs.map((crumb) => ({ text: crumb.text ?? '', url: crumb.url ?? '' })),

  hooks: {
    // theme: DO_Landing_Page::onsave()
    beforeSave: (page) => (page.slug === 'home' ? { ...page, title: 'Home' } : page),
  },
});
