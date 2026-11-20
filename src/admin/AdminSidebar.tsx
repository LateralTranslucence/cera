'use client';
/**
 * The admin's sidebar: the Cera lockup, sections of navigation, and the
 * signed-in person at the bottom with a menu for their account and signing
 * out. Sites pass the sections, so the sidebar only lists what exists.
 *
 * An expandable item (e.g. Pages) has two targets: its label goes to the
 * section's index, and a chevron button shows its items, with "+ New" on
 * top. Whether each one is open is remembered per browser.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CeraLockup, Icon, type IconName } from './icons.tsx';

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  active?: boolean;
  count?: number;
  /** Makes the item expandable. */
  expand?: {
    /** "+ New" link; `newLabel` names it for screen readers ("New page"). */
    newHref?: string;
    newLabel?: string;
    items: Array<{ label: string; href: string; current?: boolean }>;
    /** Open when nothing is remembered yet. */
    defaultOpen?: boolean;
  };
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export interface AdminSidebarProps {
  homeHref: string;
  sections: NavSection[];
  user: { name: string; role: string };
  /** Links in the user menu (e.g. Account). */
  userLinks?: Array<{ label: string; href: string; icon: IconName }>;
  /** A server action that signs out. */
  signOut?: () => Promise<void>;
}

const STORAGE_KEY = 'cera:nav-open';

function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** "Ada Lovelace" → "AL"; "ada.lovelace@x" → "AL"; "admin@x" → "A". */
export function initials(name: string): string {
  const words = name.split('@')[0]!.split(/[\s._-]+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}

export function AdminSidebar({ homeHref, sections, user, userLinks = [], signOut }: AdminSidebarProps) {
  return (
    <nav className="cera-sidebar" aria-label="Main">
      <CeraLockup href={homeHref} />
      {sections.map((section) => (
        <div key={section.label} className="cera-nav__section">
          <div className="cera-nav__label">{section.label}</div>
          {section.items.map((item) => (item.expand ? <ExpandableItem key={item.href} item={item} /> : <Item key={item.href} item={item} />))}
        </div>
      ))}
      <UserChip user={user} links={userLinks} signOut={signOut} />
    </nav>
  );
}

function ItemLink({ item, children }: { item: NavItem; children?: ReactNode }) {
  return (
    <a className="cera-nav__link" href={item.href} aria-current={item.active ? 'page' : undefined}>
      <Icon name={item.icon} />
      <span>{item.label}</span>
      {item.count !== undefined && <span className="cera-nav__count">{item.count}</span>}
      {children}
    </a>
  );
}

function Item({ item }: { item: NavItem }) {
  return (
    <div className={`cera-nav__item${item.active ? ' is-active' : ''}`}>
      <ItemLink item={item} />
    </div>
  );
}

function ExpandableItem({ item }: { item: NavItem }) {
  const expand = item.expand!;
  const listId = useId();
  const [open, setOpen] = useState(expand.defaultOpen ?? false);
  // The remembered state is read after hydration, so the server's HTML always matches.
  useEffect(() => {
    const saved = readOpen()[item.href];
    if (saved !== undefined) setOpen(saved);
  }, [item.href]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readOpen(), [item.href]: next }));
    } catch {
      // Storage unavailable (private mode): it just isn't remembered.
    }
  };

  return (
    <>
      <div className={`cera-nav__row${item.active ? ' is-active' : ''}`}>
        <ItemLink item={item} />
        <button type="button" className="cera-nav__toggle" aria-label={`Show ${item.label.toLowerCase()}`} aria-expanded={open} aria-controls={listId} onClick={toggle}>
          <Icon name="chevronRight" size={16} strokeWidth={2} />
        </button>
      </div>
      <div id={listId} hidden={!open}>
        {expand.newHref && (
          <a className="cera-text-button cera-nav__new" href={expand.newHref} aria-label={expand.newLabel}>
            <Icon name="plus" size={16} strokeWidth={2} />
            New
          </a>
        )}
        <ul className="cera-nav__list" aria-label={item.label}>
          {expand.items.length === 0 && <li className="cera-nav__empty">None yet</li>}
          {expand.items.map((sub) => (
            <li key={sub.href}>
              <a href={sub.href} aria-current={sub.current ? 'page' : undefined} title={sub.label}>
                {sub.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function UserChip({ user, links, signOut }: { user: AdminSidebarProps['user']; links: NonNullable<AdminSidebarProps['userLinks']>; signOut?: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);

  // Close on Escape or a click elsewhere.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div className="cera-user" ref={root}>
      <div className="cera-menu" id={menuId} hidden={!open}>
        {links.map((l) => (
          <a key={l.href} href={l.href}>
            <Icon name={l.icon} />
            {l.label}
          </a>
        ))}
        {signOut && (
          <form action={signOut}>
            <button type="submit">
              <Icon name="signOut" />
              Sign out
            </button>
          </form>
        )}
      </div>
      <button type="button" className="cera-user__button" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)}>
        <span className="cera-avatar" aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className="cera-user__text">
          <span className="cera-user__name">{user.name}</span>
          <span className="cera-user__role">{user.role}</span>
        </span>
      </button>
    </div>
  );
}
