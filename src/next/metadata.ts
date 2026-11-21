/**
 * Page metadata from a content type's `seo` / `jsonLd` / `hidden` functions.
 * The return value is shaped like Next's `Metadata`, so it can be returned
 * from `generateMetadata` directly, without this package importing Next.
 */
import type { AnyContentType, PageOf } from '../content-type.ts';
import type { MediaRef } from '../fields.ts';

export interface PageMetadata {
  title: string;
  description?: string;
  robots?: { index: boolean; follow: boolean };
  openGraph: {
    title: string;
    description?: string;
    images?: Array<{ url: string; width?: number; height?: number; alt?: string }>;
  };
}

export interface MetadataOptions {
  /** Turns a media reference into a public URL (e.g. the site's `mediaUrl`). */
  mediaUrl?: (ref: MediaRef) => string;
}

export function pageMetadata<Type extends AnyContentType>(contentType: Type, page: PageOf<Type>, options: MetadataOptions = {}): PageMetadata {
  const title = contentType.seo?.title?.(page) || page.title;
  const description = contentType.seo?.description?.(page) || undefined;
  const image = contentType.seo?.image?.(page);
  const noindex = Boolean(contentType.seo?.noindex?.(page) || contentType.hidden?.(page));

  const meta: PageMetadata = { title, openGraph: { title } };
  if (description) {
    meta.description = description;
    meta.openGraph.description = description;
  }
  if (image) {
    meta.openGraph.images = [{ url: options.mediaUrl ? options.mediaUrl(image) : image.path, width: image.width, height: image.height, alt: image.alt }];
  }
  if (noindex) meta.robots = { index: false, follow: false };
  return meta;
}

/**
 * The page's JSON-LD as a string that is safe inside
 * `<script type="application/ld+json">` (`<` is escaped, so content can't
 * close the script tag). `undefined` if the content type defines none.
 */
export function jsonLdString<Type extends AnyContentType>(contentType: Type, page: PageOf<Type>): string | undefined {
  const data = contentType.jsonLd?.(page);
  if (!data) return undefined;
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
