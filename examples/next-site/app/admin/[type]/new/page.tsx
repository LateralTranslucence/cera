import { admin } from '../../admin.ts';

type Props = { params: Promise<{ type: string }> };

export async function generateMetadata({ params }: Props) {
  return admin.metadataFor((await params).type, 'new');
}

export default async function New({ params }: Props) {
  return <admin.NewScreen path={(await params).type} />;
}
