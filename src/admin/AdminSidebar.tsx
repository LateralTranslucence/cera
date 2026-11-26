'use client';
/**
 * The admin's sidebar: the Cera lockup, sections of navigation, and the
 * signed-in person at the bottom with a menu for their account and signing
 * out. Sites pass the sections, so the sidebar only lists what exists.
 *
 * An expandable item (e.g. Pages) has two targets: its label goes to the
 * section's index, and a chevron button shows its items, with "+ New" on
 * top. Whether each one is open is remembered per browser.
 *
 * At 900px and narrower the sidebar collapses to a rail of icons (admin.css)
 * that stays on screen as the page scrolls: labels stay for screen readers
 * and show as a tooltip on hover or focus, and expandable items' lists are
 * hidden. When the screen is too short for the whole rail (a phone held
 * sideways), the rail shows just the seal and a menu button, which opens the
 * full menu, with labels, beside it.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
  /** Signs out: a server action, or the address of a route that signs out on POST. */
  signOut?: (() => Promise<void>) | string;
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
  return words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join('') || '?';
}

/** The width at which the sidebar becomes a rail (keep in step with admin.css). */
const RAIL_QUERY = '(max-width: 900px)';

// useLayoutEffect warns during server rendering; there's nothing to measure there anyway.
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function AdminSidebar({ homeHref, sections, user, userLinks = [], signOut }: AdminSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const bodyId = useId();
  // Compact: the rail doesn't fit the screen's height, so it's a menu button.
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Whether the whole rail fits: the seal, then every section and the person,
  // at their rail sizes. While compact, the menu is still laid out (hidden) at
  // rail size, so it can be measured; while the menu is open it's laid out as
  // a panel instead, so the last answer stands.
  useBrowserLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    const body = bodyRef.current;
    if (!sidebar || !body) return;
    const rail = window.matchMedia(RAIL_QUERY);
    const measure = () => {
      if (!rail.matches) return setCompact(false);
      if (sidebar.classList.contains('is-open')) return;
      const sidebarStyle = getComputedStyle(sidebar);
      const children = [...body.children] as HTMLElement[];
      const gaps = parseFloat(getComputedStyle(body).rowGap) || 0;
      const content = children.reduce((total, child) => total + child.offsetHeight, 0) + gaps * Math.max(children.length - 1, 0);
      const lockup = sidebar.querySelector<HTMLElement>('.cera-lockup')?.offsetHeight ?? 0;
      const needed = parseFloat(sidebarStyle.paddingTop) + lockup + (parseFloat(sidebarStyle.rowGap) || 0) + content + parseFloat(sidebarStyle.paddingBottom);
      setCompact(needed > window.innerHeight);
    };
    measure();
    window.addEventListener('resize', measure);
    rail.addEventListener('change', measure);
    return () => {
      window.removeEventListener('resize', measure);
      rail.removeEventListener('change', measure);
    };
  }, [sections]);

  // Leaving compact mode closes the menu.
  useEffect(() => {
    if (!compact) setMenuOpen(false);
  }, [compact]);

  // An open menu closes on Escape (back to its button) or a click outside the sidebar.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    const onClick = (event: MouseEvent) => !sidebarRef.current?.contains(event.target as Node) && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [menuOpen]);

  return (
    <nav ref={sidebarRef} className={`cera-sidebar${compact ? ' is-compact' : ''}${menuOpen ? ' is-open' : ''}`} aria-label="Main">
      <CeraLockup href={homeHref} />
      <button
        ref={menuButtonRef}
        type="button"
        className="cera-sidebar__menu-button"
        aria-label={menuOpen ? 'Close menu' : 'Menu'}
        aria-expanded={menuOpen}
        aria-controls={bodyId}
        hidden={!compact}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <Icon name={menuOpen ? 'close' : 'menu'} />
      </button>
      <div ref={bodyRef} id={bodyId} className="cera-sidebar__body">
        {sections.map((section) => (
          <div key={section.label} className="cera-nav__section">
            <div className="cera-nav__label">{section.label}</div>
            {section.items.map((item) => (item.expand ? <ExpandableItem key={item.href} item={item} /> : <Item key={item.href} item={item} />))}
          </div>
        ))}
        <UserChip user={user} links={userLinks} signOut={signOut} />
      </div>
    </nav>
  );
}

function ItemLink({ item, children }: { item: NavItem; children?: ReactNode }) {
  return (
    <a className="cera-nav__link" href={item.href} aria-current={item.active ? 'page' : undefined}>
      <Icon name={item.icon} />
      <span className="cera-nav__text">{item.label}</span>
      {item.count !== undefined && <span className="cera-nav__count">{item.count}</span>}
      {children}
      <span className="cera-nav__tip" aria-hidden="true">
        {item.label}
      </span>
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
      <div id={listId} className="cera-nav__sub" hidden={!open}>
        {expand.newHref && (
          <a className="cera-text-button cera-nav__new" href={expand.newHref} aria-label={expand.newLabel}>
            <Icon name="plus" size={16} strokeWidth={2} />
            New
          </a>
        )}
        <ul className="cera-nav__list" aria-label={item.label}>
          {expand.items.length === 0 && <li className="cera-nav__empty">None yet</li>}
          {expand.items.map((subItem) => (
            <li key={subItem.href}>
              <a href={subItem.href} aria-current={subItem.current ? 'page' : undefined} title={subItem.label}>
                {subItem.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function UserChip({ user, links, signOut }: { user: AdminSidebarProps['user']; links: NonNullable<AdminSidebarProps['userLinks']>; signOut?: AdminSidebarProps['signOut'] }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);

  // Close on Escape or a click elsewhere.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    const onClick = (event: MouseEvent) => !root.current?.contains(event.target as Node) && setOpen(false);
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
        {links.map((link) => (
          <a key={link.href} href={link.href}>
            <Icon name={link.icon} />
            {link.label}
          </a>
        ))}
        {signOut && (
          <form action={signOut} {...(typeof signOut === 'string' && { method: 'post' })}>
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
        <span className="cera-nav__tip" aria-hidden="true">
          {user.name}
        </span>
      </button>
    </div>
  );
}
