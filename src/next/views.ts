/**
 * Which component shows each content type's pages on the public site. The
 * site's catch-all route finds the page for an address (`matchRoute`, then
 * findPublishedPage) and renders its type's view:
 *
 *   // cera/views.ts
 *   export const views = defineViews(contentTypes, {
 *     landing_page: LandingPageView,
 *     simple_page: SimplePageView,
 *   });
 *
 *   // components/RoutedPage.tsx
 *   const View = views.viewFor(loaded.type);
 *   return <View page={loaded.page} loadContext={loadContext} />;
 *
 * Each view is typed by its own content type's pages. Types without a
 * `route` (forms, icons) need none.
 */
import type { ComponentType } from 'react';
import type { AnyContentType, PageOf } from '../content-type.ts';
import type { LoadContext } from '../panel.ts';

/** What every view is given: the page, and how its panels look up linked pages, forms and the rest. */
export interface ViewProps<Type extends AnyContentType> {
  page: PageOf<Type>;
  loadContext: Pick<LoadContext, 'pages' | 'draft' | 'forms' | 'icons' | 'search'>;
}

/** A view for each content type, by name. */
export type Views<Types extends readonly AnyContentType[]> = {
  [Type in Types[number] as Type['name']]?: ComponentType<ViewProps<Type>>;
};

export function defineViews<const Types extends readonly AnyContentType[]>(contentTypes: Types, views: Views<Types>) {
  const byName = views as Record<string, ComponentType<ViewProps<AnyContentType>> | undefined>;
  /** The types with pages of their own (a `route`): the ones the site's catch-all route serves. */
  const routedTypes = contentTypes.filter((contentType) => Boolean(contentType.route)) as unknown as Types;

  return {
    routedTypes,
    /** The content type called `name`. */
    typeOf(name: string): Types[number] {
      const contentType = contentTypes.find((candidate) => candidate.name === name);
      if (!contentType) throw new Error(`cera: no content type "${name}".`);
      return contentType;
    },
    /** The view for a type's pages. Throws when a routed type has none, naming what to add. */
    viewFor(name: string): ComponentType<ViewProps<AnyContentType>> {
      const View = byName[name];
      if (!View) throw new Error(`cera: content type "${name}" has a route but no view. Add one to defineViews: { ${name}: ${name.replace(/(^|_)([a-z])/g, (_match, _start, letter: string) => letter.toUpperCase())}View }.`);
      return View;
    },
  };
}

export type DefinedViews = ReturnType<typeof defineViews>;
