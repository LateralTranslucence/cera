// Ported from DO_Simple_Page (class-simple-page.php): a plain page with an
// image, a description and rich-text content, and no panels.
//
// Differences from the theme:
//   - Simple pages live at /[slug], next to landing pages (the theme used
//     /page/[slug]). They share landing pages' addresses (`slugScope`), so a
//     simple page and a landing page can never claim the same one.
//   - No character counters (the theme's 60 for the title, 160 for the
//     description): the title is the editor's built-in field, and the
//     description is rich text. Search engines get the description's first
//     160 characters, with its formatting removed.
import { defineContentType, f } from '@lateraltranslucence/cera';

const stripHtml = (html = '') => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export const simplePage = defineContentType({
  name: 'simple_page',
  label: 'Simple Page',
  route: '/[slug]',
  slugScope: 'landing_page',
  url: (p) => `/${p.slug}`,

  boxes: {
    content: {
      image: f.media({ label: 'Image', accept: ['image'] }),
      imageCredit: f.text({ label: 'Image Credit' }),
      description: f.html({ label: 'Description', toolbar: 'limited', note: 'Shown under the title. Search engines get its first 160 characters.' }),
      content: f.html({ label: 'Content' }),
    },
    seo: {
      image: f.media({ label: 'SEO Image', accept: ['image'], note: 'For sharing on social media. Defaults to the Image.' }),
    },
    admin: {
      hidden: f.toggle({ label: 'Hidden' }),
    },
  },

  editor: { pageBoxes: ['admin'] },

  seo: {
    title: (p) => p.title,
    description: (p) => stripHtml(p.boxes.content.description).slice(0, 160) || undefined,
    image: (p) => p.boxes.seo.image ?? p.boxes.content.image,
  },

  // theme: settings()['schema']
  jsonLd: (p) => ({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    headline: p.title,
    description: stripHtml(p.boxes.content.description) || undefined,
    text: stripHtml(p.boxes.content.content) || undefined,
  }),

  hidden: (p) => p.boxes.admin.hidden,
});
