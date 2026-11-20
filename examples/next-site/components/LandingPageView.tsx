import type { LoadContext, PageOf } from '@lateraltranslucence/cera';
import { jsonLdString, Panels } from '@lateraltranslucence/cera/next';
import { CtaLinks, Html } from '@lateraltranslucence/cera/panels';
import { mediaUrl } from '@lateraltranslucence/cera/supabase';
import { landingPage } from '../cera/index.ts';

type LandingPage = PageOf<typeof landingPage>;

function Hero({ hero, fallbackTitle }: { hero: LandingPage['boxes']['hero']; fallbackTitle: string }) {
  const bg = hero.background;
  const style = {
    ...(bg.color && { backgroundColor: bg.color }),
    ...(bg.media && bg.media.kind === 'image' && { backgroundImage: `url(${mediaUrl(bg.media)})` }),
  };
  return (
    <header className={`hero${bg.overlay ? ' hero--overlay' : ''}${bg.color || bg.media ? ' hero--has-bg' : ''}`} style={style}>
      {bg.media?.kind === 'video' && <video className="hero__video" src={mediaUrl(bg.media)} autoPlay muted loop playsInline />}
      <div className="hero__inner">
        <h1>{hero.title || fallbackTitle}</h1>
        {hero.copy && <Html html={hero.copy} />}
        <CtaLinks ctas={hero.ctas} />
      </div>
    </header>
  );
}

export async function LandingPageView({ page, loadContext }: { page: LandingPage; loadContext: Pick<LoadContext, 'pages' | 'draft'> }) {
  const jsonLd = jsonLdString(landingPage, page);
  return (
    <main className={page.boxes.admin.css || undefined}>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}
      <Hero hero={page.boxes.hero} fallbackTitle={page.title} />
      <Panels contentType={landingPage} page={page} loadContext={loadContext} />
    </main>
  );
}
