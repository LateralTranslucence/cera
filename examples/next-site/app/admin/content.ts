/**
 * Where each content type lives in the admin: its list, its editor's base
 * path, and the sidebar section it lights up. Plain data, so both server
 * pages and client wrappers can read it.
 */
export const ADMIN_PLACES = {
  landing_page: { section: 'pages', list: '/admin', base: '/admin/pages', title: 'Pages', noun: 'page' },
  simple_page: { section: 'simple-pages', list: '/admin/simple-pages', base: '/admin/simple-pages', title: 'Simple Pages', noun: 'page' },
  cera_form: { section: 'forms', list: '/admin/forms', base: '/admin/forms', title: 'Forms', noun: 'form' },
  cera_icon: { section: 'icons', list: '/admin/icons', base: '/admin/icons', title: 'Icons', noun: 'icon' },
} as const;

export type AdminPlace = (typeof ADMIN_PLACES)[keyof typeof ADMIN_PLACES];

export function placeOf(contentType: string): AdminPlace {
  return ADMIN_PLACES[contentType as keyof typeof ADMIN_PLACES] ?? ADMIN_PLACES.landing_page;
}
