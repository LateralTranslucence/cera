// Ported from DO_Landing_Page (class-landing-page.php).
import { defineContentType, f } from '@lateraltranslucence/cera';
import { blocks } from '../panels/blocks.ts';
import { featuredPost } from '../panels/featured-post.ts';
import { textMedia } from '../panels/text-media.ts';

const stripHtml = (html = '') => html.replace(/<[^>]+>/g, '').trim();

export const landingPage = defineContentType({
  name: 'landing_page',
  label: 'Landing Page',
  route: '/[slug]', // theme: rewrite rule '[^/]+/?$' with no post type slug
  url: (p) => (p.slug === 'home' ? '/' : `/${p.slug}`), // the home page lives at /

  boxes: {
    hero: {
      title: f.text({ label: 'Title' }),
      background: f.background({ label: 'Background' }),
      copy: f.html({ label: 'Copy' }),
      ctas: f.ctas({ label: 'CTA' }),
    },
    seo: {
      title: f.text({ label: 'SEO Title', maxLength: 60, note: 'Overwrites page "Title" field for SEO use.' }),
      description: f.textarea({ label: 'SEO Description', maxLength: 160, note: 'Overwrites hero "Copy" field for SEO use.' }),
      image: f.media({ label: 'SEO Image', accept: ['image'] }),
    },
    admin: {
      hidden: f.toggle({ label: 'Hidden' }),
      noindex: f.toggle({ label: 'NoIndex' }),
      css: f.text({ label: 'CSS' }),
      pageType: f.select({ label: 'Landing Page Type', options: { 'landing-page': 'Landing Page', form: 'Form' }, default: 'landing-page' }),
      schemaType: f.select({
        label: 'Schema',
        options: { WebPage: 'WebPage (default)', AboutPage: 'AboutPage', ContactPage: 'ContactPage', SearchResultsPage: 'SearchResultsPage' },
        default: 'WebPage',
      }),
      breadcrumbs: f.repeater({ label: 'Breadcrumbs', itemTitle: 'text', fields: { text: f.text(), url: f.url() } }),
    },
  },

  panels: [blocks, featuredPost, textMedia],

  // Admin settings sit with title and slug; the hero renders like a panel, so it sits with them.
  editor: { pageBoxes: ['admin'], leadBoxes: ['hero'] },

  seo: {
    title: (p) => p.boxes.seo.title || p.title,
    description: (p) => p.boxes.seo.description || stripHtml(p.boxes.hero.copy),
    image: (p) => p.boxes.seo.image,
    noindex: (p) => p.boxes.admin.noindex,
  },

  jsonLd: (p) => ({
    '@context': 'https://schema.org',
    '@type': p.boxes.admin.schemaType,
    headline: p.title,
    description: p.boxes.seo.description,
  }),

  hidden: (p) => p.boxes.admin.hidden,

  hooks: {
    // theme: DO_Landing_Page::onsave()
    beforeSave: (p) => (p.slug === 'home' ? { ...p, title: 'Home' } : p),
  },
});
