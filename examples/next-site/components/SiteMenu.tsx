'use client';
import { usePathname } from 'next/navigation';
import { Menu, type MenuLink } from '@lateraltranslucence/cera/menus';

/** A menu that marks the page being shown as current. */
export function SiteMenu({ links, label, className }: { links: MenuLink[]; label: string; className?: string }) {
  return <Menu links={links} label={label} currentPath={usePathname()} className={className} />;
}
