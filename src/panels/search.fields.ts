// Ported from class-landing-page.php → set_panel_fields()['search'].
// Differences from the theme: no "Modal" (Cera has no modals yet, as with
// Posts), and Custom Sort By picks from the built-in orders, relabeled and
// reordered, instead of naming meta keys.
import { field } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';
import { DEFAULT_PER_PAGE, MAX_PER_PAGE, SORT_LABELS } from '../search/model.ts';

const publicTypes = (context: { contentTypes: Array<{ name: string; label: string; public: boolean }> }) =>
  context.contentTypes.filter((contentType) => contentType.public).map((contentType) => ({ label: contentType.label, value: contentType.name }));

export const searchFields = {
  ...panelDefaults,
  postTypes: field.selectFrom({
    label: 'Search Post Types',
    note: 'The kinds of page visitors can find. None ticked: every kind with pages of its own.',
    multiple: true,
    options: publicTypes,
  }),
  filters: field.repeater({
    label: 'Search Fields',
    itemTitle: 'label',
    fields: {
      label: field.text({ label: 'Field Name', note: 'Shown above the filter, e.g. “Keyword”.' }),
      kind: field.select({
        label: 'Field Type',
        options: { search: 'Text Search', alphabet: 'Alphabet', post_types: 'Post Types', select_list: 'Select List' },
        default: 'search',
      }),
      optionsType: field.selectFrom({ label: 'Options Post Type', note: 'Select List: its options are the published pages of this kind.', options: publicTypes }),
      field: field.text({ label: 'Meta Field', note: 'Select List: the field, on the pages searched, that links to the picked page. Empty: any link to it.' }),
    },
  }),
  perRow: field.perRow({ label: 'Posts Per Row', note: 'Default is 3.' }),
  perPage: field.number({ label: 'Posts Per Page', int: true, min: 1, max: MAX_PER_PAGE, note: `Default is ${DEFAULT_PER_PAGE}.` }),
  sortBy: field.repeater({
    label: 'Custom Sort By',
    itemTitle: 'label',
    note: 'The sort orders offered, in this order; the first is the default. Empty: all four, newest first.',
    fields: {
      value: field.select({ label: 'Value', options: SORT_LABELS, default: 'newest' }),
      label: field.text({ label: 'Label', note: 'Default: the order’s own name.' }),
    },
  }),
  hideSortBy: field.toggle({ label: 'Hide Sort By' }),
};
