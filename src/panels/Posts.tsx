// Ports app/components/panels/Posts.tsx with the theme's “block” card. The
// cards are rendered here, on the server; PostsSlider only adds the
// Previous/Next buttons when the slider is on.
import type { PanelPropsOf } from '../panel.ts';
import { CtaLinks } from './CtaLinks.tsx';
import { PanelFrame } from './PanelFrame.tsx';
import { PostsSlider } from './PostsSlider.tsx';
import { mediaUrl } from '../media-url.ts';
import type { postsFields } from './posts.fields.ts';
import type { PostsLoaded } from './posts.load.ts';

export default function Posts({ data, loaded, panel }: PanelPropsOf<typeof postsFields, PostsLoaded>) {
  // Nothing picked, or nothing published yet: no panel at all, like Featured Post.
  if (loaded.pages.length === 0) return null;

  const cards = loaded.pages.map((page) => (
    <li key={page.id} className="post-card">
      {page.image && (
        <img className="post-card__image" src={mediaUrl(page.image)} alt="" width={page.image.width} height={page.image.height} loading="lazy" />
      )}
      <div className="post-card__text">
        <p className="post-card__type">{page.contentTypeLabel}</p>
        <h3>
          {/* The link covers the whole card (see the stylesheet); its text is the title. */}
          <a href={page.url} className="post-card__link">
            {page.title}
          </a>
        </h3>
        {page.description && <p className="post-card__description">{page.description}</p>}
      </div>
    </li>
  ));

  const label = data.title ? `${data.title}: ` : '';
  return (
    <PanelFrame name="posts" data={data} panel={panel}>
      <CtaLinks ctas={data.ctas} />
      {data.slider && loaded.pages.length > data.perRow ? (
        <PostsSlider perRow={data.perRow} label={`${label}posts`}>
          {cards}
        </PostsSlider>
      ) : (
        <ul className="posts" style={{ ['--per-row' as string]: data.perRow }}>
          {cards}
        </ul>
      )}
    </PanelFrame>
  );
}
