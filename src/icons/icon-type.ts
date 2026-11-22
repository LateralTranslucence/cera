// The Icon content type, ported from DO_Icon (class-icon.php): a site's own
// icons, offered next to the bundled sets wherever there's an field.icon() field.
// Icons have no pages of their own. A field stores `custom:<icon id>`.
//
// Differences from the theme:
//   - The file is an SVG stored with the icon (cleaned on save, svg.ts), not
//     a media-library upload: the media library refuses SVG (decision 23).
//   - Black becomes currentColor on save, as the theme's onsave did, but in
//     the icon's own copy; nothing else is rewritten.
//   - "Preview" is the admin list's icon column, not a stored field.
import { defineContentType } from '../content-type.ts';
import { field } from '../fields.ts';

export const iconType = defineContentType({
  name: 'cera_icon',
  label: 'Icon',
  boxes: {
    icon: {
      svg: field.svg({
        label: 'File',
        required: true,
        note: 'An SVG. Scripts, links and anything else that isn’t drawing are removed on save, and black becomes the color of the text around the icon.',
      }),
      keywords: field.textarea({ label: 'Keywords', note: 'Other words people might search for, separated by commas or spaces.' }),
      hidden: field.toggle({ label: 'Hidden', note: 'Hidden icons aren’t offered in the icon picker. Pages that already use one keep it.' }),
    },
  },
  editor: {
    icon: 'shapes',
    section: 'Library',
    pageBoxes: ['icon'],
    noun: 'icon',
    titleLabel: 'Label',
    slugLabel: 'Icon ID',
    slugNote: 'Lowercase words joined by hyphens, e.g. “rocket”.',
  },
  hidden: (page) => page.boxes.icon.hidden,
});

export type IconType = typeof iconType;
