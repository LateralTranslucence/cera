'use client';
/**
 * A menu on the live site: a list of links, where an item with a submenu
 * gets a button that opens it (aria-expanded), by click, tap or keyboard.
 * Escape, or focus or a click moving elsewhere, closes it. Unstyled apart
 * from its class names, which the site's CSS styles:
 *
 *   .cera-menu, .cera-menu__item (.has-children, .is-open, .is-current,
 *   .has-current), .cera-menu__link, .cera-menu__toggle, .cera-menu__submenu,
 *   .cera-menu__icon
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type FocusEvent } from 'react';
import { linksTo, type MenuLink } from './model.ts';

export interface MenuProps {
  links: MenuLink[];
  /** The nav's name for screen readers, e.g. "Main". */
  label: string;
  /** The page being shown, to mark its link as current. */
  currentPath?: string;
  className?: string;
}

const containsCurrent = (link: MenuLink, path: string): boolean => linksTo(link.href, path) || link.children.some((child) => containsCurrent(child, path));

function Entry({ link, currentPath }: { link: MenuLink; currentPath?: string }) {
  const [open, setOpen] = useState(false);
  const itemRef = useRef<HTMLLIElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const submenuId = useId();
  const hasChildren = link.children.length > 0;
  const current = currentPath !== undefined && linksTo(link.href, currentPath);
  const hasCurrent = currentPath !== undefined && !current && containsCurrent(link, currentPath);

  // A click or tap anywhere else closes the submenu.
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!itemRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.key === 'Escape' && open) {
      // Handled here, so an enclosing panel doesn't close too.
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    }
  };
  const onBlur = (event: FocusEvent<HTMLLIElement>) => {
    if (open && !itemRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
  };

  const classes = ['cera-menu__item', hasChildren && 'has-children', open && 'is-open', current && 'is-current', hasCurrent && 'has-current'].filter(Boolean).join(' ');
  const content = (
    <>
      {link.icon && <span className="cera-menu__icon cera-icon-glyph" aria-hidden="true" dangerouslySetInnerHTML={{ __html: link.icon }} />}
      <span className="cera-menu__label">{link.label}</span>
    </>
  );

  return (
    <li className={classes} ref={itemRef} {...(hasChildren && { onKeyDown, onBlur })}>
      {link.href ? (
        <a className="cera-menu__link" href={link.href} {...(current && { 'aria-current': 'page' as const })} {...(link.newTab && { target: '_blank', rel: 'noopener noreferrer' })}>
          {content}
        </a>
      ) : hasChildren ? null : (
        <span className="cera-menu__link">{content}</span>
      )}
      {hasChildren && (
        <>
          <button
            ref={buttonRef}
            type="button"
            className={`cera-menu__toggle${link.href ? '' : ' cera-menu__link'}`}
            aria-expanded={open}
            aria-controls={submenuId}
            onClick={() => setOpen(!open)}
          >
            {link.href ? <span className="cera-visually-hidden">{link.label} submenu</span> : content}
          </button>
          <ul className="cera-menu__submenu" id={submenuId}>
            {link.children.map((child) => (
              <Entry key={child.id} link={child} currentPath={currentPath} />
            ))}
          </ul>
        </>
      )}
    </li>
  );
}

export function Menu({ links, label, currentPath, className }: MenuProps) {
  if (links.length === 0) return null;
  return (
    <nav className={`cera-menu${className ? ` ${className}` : ''}`} aria-label={label}>
      <ul className="cera-menu__list">
        {links.map((link) => (
          <Entry key={link.id} link={link} currentPath={currentPath} />
        ))}
      </ul>
    </nav>
  );
}
