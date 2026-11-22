import { admin } from '../../admin.ts';

type Props = { params: Promise<{ type: string; id: string }> };

export async function generateMetadata({ params }: Props) {
  return admin.metadataFor((await params).type, 'edit');
}

export default async function Edit({ params }: Props) {
  const { type, id } = await params;
  return <admin.EditScreen path={type} id={id} />;
}
