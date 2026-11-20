// Ports app/components/panels/FeaturedPost.tsx from the theme. Difference: the
// theme rendered nothing without an image; here the image is optional, since
// Cera pages don't always have one.
import type { PanelPropsOf } from '../panel.ts';
import { CtaLink } from './CtaLinks.tsx';
import { Html } from './Html.tsx';
import { mediaUrl } from '../media-url.ts';
import type { featuredPostFields } from './featured-post.fields.ts';
import type { FeaturedPostLoaded } from './featured-post.load.ts';

export default function FeaturedPost({ data, loaded, panel }: PanelPropsOf<typeof featuredPostFields, FeaturedPostLoaded>) {
  const linked = loaded.page;
  const title = data.overrideTitle || linked?.title;
  // No linked page (none picked, or not published) and no override: nothing to feature.
  if (!title) return null;

  const image = data.overrideImage ?? linked?.image;
  const pretitle = data.overridePretitle || linked?.contentTypeLabel;
  const url = data.overrideUrl || linked?.url;

  return (
    <section id={data.anchorId} className="panel panel--featured-post" data-index={panel.index}>
      {image && (
        <figure className="featured-post__image">
          <img src={mediaUrl(image)} alt={image.alt ?? ''} width={image.width} height={image.height} loading="lazy" />
        </figure>
      )}
      <div className="featured-post__content">
        {pretitle && <p className="featured-post__pretitle">{pretitle}</p>}
        <h2>{title}</h2>
        {data.overrideDescription ? (
          <Html html={data.overrideDescription} className="rich-text featured-post__excerpt" />
        ) : (
          linked?.description && <p className="featured-post__excerpt">{linked.description}</p>
        )}
        {url && (
          <p className="ctas">
            <CtaLink cta={{ text: data.overrideCtaText || 'Read more', url, target: data.linkTarget }} />
          </p>
        )}
      </div>
    </section>
  );
}
