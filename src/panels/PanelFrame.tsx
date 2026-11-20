/**
 * What every panel shares, ported from the theme's Panel + PanelWrapper: the
 * section with its anchor id, the background (color, image or video, with an
 * optional dark overlay), the title and the copy. Each core panel renders its
 * own content inside.
 *
 * The background image is passed as the `--background-image` custom property,
 * as in the theme, so a site's stylesheet decides how it's drawn.
 *
 * Classes, for site stylesheets:
 *   panel panel--<name>   always (name without the cera/ prefix)
 *   has-background        a color, image or video is set
 *   has-overlay           the dark overlay is on
 *   has-video             the background is a video
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Background } from '../fields.ts';
import type { PanelContext } from '../panel.ts';
import { mediaUrl } from '../media-url.ts';
import { Html } from './Html.tsx';

export interface PanelFrameData {
  title?: string;
  copy?: string;
  background?: Background;
  anchorId?: string;
}

export function PanelFrame({
  name,
  data,
  panel,
  className,
  children,
}: {
  /** The panel's name without the `cera/` prefix, e.g. `blocks`. */
  name: string;
  data: PanelFrameData;
  panel: PanelContext;
  /** Extra classes for the section. */
  className?: string;
  children?: ReactNode;
}) {
  const bg = data.background;
  const media = bg?.media;
  const video = media?.kind === 'video';
  const style: Record<string, string> = {};
  if (bg?.color) style.backgroundColor = bg.color;
  // Quoted, so a path with spaces or brackets can't break the url() token.
  if (media && media.kind === 'image') style['--background-image'] = `url("${mediaUrl(media).replace(/"/g, '%22')}")`;

  const classes = ['panel', `panel--${name}`];
  if (className) classes.push(className);
  if (bg?.color || media) classes.push('has-background');
  if (bg?.overlay) classes.push('has-overlay');
  if (video) classes.push('has-video');

  return (
    <section
      id={data.anchorId || undefined}
      className={classes.join(' ')}
      style={Object.keys(style).length ? (style as CSSProperties) : undefined}
      data-index={panel.index}
    >
      {video && <video className="panel__video" src={mediaUrl(media)} autoPlay muted loop playsInline aria-hidden="true" />}
      <div className="panel__inner">
        {data.title && (
          <header className="panel__header">
            <h2>{data.title}</h2>
          </header>
        )}
        {data.copy && <Html html={data.copy} className="rich-text panel__copy" />}
        {children}
      </div>
    </section>
  );
}
