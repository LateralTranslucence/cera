/**
 * Which component shows each content type's pages. A type with a `route`
 * needs one here; app/(site)/[[...path]] finds the page for an address and
 * renders its type's view.
 */
import { defineViews } from '@lateraltranslucence/cera/next';
import { LandingPageView } from '../components/LandingPageView.tsx';
import { SimplePageView } from '../components/SimplePageView.tsx';
import { contentTypes } from './index.ts';

export const views = defineViews(contentTypes, {
  landing_page: LandingPageView,
  simple_page: SimplePageView,
});
