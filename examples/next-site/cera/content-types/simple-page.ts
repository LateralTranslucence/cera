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
import { defineContentType, field } from '@lateraltranslucence/cera';

const stripHtml = (html = '') => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export const simplePage = defineContentType({
  name: 'simple_page',
  label: 'Simple Page',
  route: '/[slug]',
  slugScope: 'landing_page',
  url: (page) => `/${page.slug}`,

  boxes: {
    content: {
      image: field.media({ label: 'Image', accept: ['image'] }),
      imageCredit: field.text({ label: 'Image Credit' }),
      description: field.html({ label: 'Description', toolbar: 'limited', note: 'Shown under the title. Search engines get its first 160 characters.' }),
      content: field.html({ label: 'Content' }),
    },
    seo: {
      image: field.media({ label: 'SEO Image', accept: ['image'], note: 'For sharing on social media. Defaults to the Image.' }),
    },
    admin: {
      hidden: field.toggle({ label: 'Hidden' }),
    },
  },

  editor: { pageBoxes: ['admin'] },

  seo: {
    title: (page) => page.title,
    description: (page) => stripHtml(page.boxes.content.description).slice(0, 160) || undefined,
    image: (page) => page.boxes.seo.image ?? page.boxes.content.image,
  },

  // theme: settings()['schema']
  jsonLd: (page) => ({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    headline: page.title,
    description: stripHtml(page.boxes.content.description) || undefined,
    text: stripHtml(page.boxes.content.content) || undefined,
  }),

  hidden: (page) => page.boxes.admin.hidden,
});
