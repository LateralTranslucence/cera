import { redirect } from 'next/navigation';
import { admin } from './admin.ts';

/** The admin's home: the first content type's list (Pages), keeping `?error=` and `?deleted=`. */
export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const query = new URLSearchParams(await searchParams).toString();
  redirect(query ? `${admin.homePath}?${query}` : admin.homePath);
}
