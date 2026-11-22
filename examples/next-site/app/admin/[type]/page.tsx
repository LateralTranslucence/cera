import { admin } from '../admin.ts';

type Props = { params: Promise<{ type: string }>; searchParams: Promise<{ error?: string; deleted?: string }> };

export async function generateMetadata({ params }: Props) {
  return admin.metadataFor((await params).type, 'list');
}

/** A content type's list, e.g. /admin/simple-pages. */
export default async function List({ params, searchParams }: Props) {
  return <admin.ListScreen path={(await params).type} {...await searchParams} />;
}
