'use client';
import { usePathname } from 'next/navigation';

/** Leaves draft mode and returns to the page being previewed. */
export function ExitPreviewLink() {
  const path = usePathname();
  return <a href={`/api/cera/exit-preview?path=${encodeURIComponent(path)}`}>Exit preview</a>;
}
