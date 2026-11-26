'use client';
/**
 * The admin's browser side: the package's AdminClient with what only the
 * site can hand it in the browser. Content types hold functions, so they
 * can't be passed from the server; the server action must be the site's own.
 */
import { AdminClient, type AdminScreenProps } from '@lateraltranslucence/cera/admin';
import { backgroundColors, contentTypes } from './index.ts';
import { ceraAction } from './actions.ts';

export function CeraAdminClient(props: AdminScreenProps) {
  return <AdminClient {...props} contentTypes={contentTypes} colors={backgroundColors} action={ceraAction} />;
}
