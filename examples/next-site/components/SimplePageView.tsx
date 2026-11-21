import type { PageOf } from '@lateraltranslucence/cera';
import { jsonLdString } from '@lateraltranslucence/cera/next';
import { Html } from '@lateraltranslucence/cera/panels';
import { mediaUrl } from '@lateraltranslucence/cera/supabase';
import { simplePage } from '../cera/index.ts';

type SimplePage = PageOf<typeof simplePage>;

/** A simple page: title, description, image with its credit, then the content. Theme: the simple page template. */
export function SimplePageView({ page }: { page: SimplePage }) {
  const { image, imageCredit, description, content } = page.boxes.content;
  const jsonLd = jsonLdString(simplePage, page);
  return (
    <main className="simple-page">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}
      <article className="simple-page__inner">
        <header className="simple-page__head">
          <h1>{page.title}</h1>
          {description && <Html html={description} className="rich-text simple-page__description" />}
        </header>
        {image && (
          <figure className="simple-page__image">
            <img src={mediaUrl(image)} alt={image.alt ?? ''} width={image.width} height={image.height} />
            {imageCredit && <figcaption>{imageCredit}</figcaption>}
          </figure>
        )}
        {content && <Html html={content} className="rich-text simple-page__content" />}
      </article>
    </main>
  );
}
