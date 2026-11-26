'use client';
/**
 * The menu builder: a menu's items as a tree (the `menu` field kind). Each
 * item opens to its label, link and the site's own item fields. Items drag
 * to reorder among their siblings; the arrow buttons also move them in and
 * out of submenus, so everything works by keyboard too.
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { AnyField, FieldMap } from '../fields.ts';
import type { MenuFieldConfig } from '../menus/model.ts';
import { addTo, canIndent, indent, itemAt, linkedPageIds, moveTo, outdent, removeAt, replaceAt, siblingsAt, type TreeItem, type TreePath } from '../menus/tree.ts';
import { FieldMapForm, IssueList, PagePicker, type FormContext, type PageOption } from './fields.tsx';
import { GripIcon } from './icons.tsx';
import { defaultsFor, issuesAt, newId, type Path } from './state.ts';

type LinkKind = 'page' | 'url' | 'none';

const PAGE_FIELD = { kind: 'relation', meta: {}, config: { to: [], limit: 1 } } as unknown as AnyField;

const asItems = (value: unknown): TreeItem[] => (Array.isArray(value) ? value.filter((item): item is TreeItem => typeof item === 'object' && item !== null) : []);
const keyOf = (item: TreeItem, path: TreePath) => (typeof item._id === 'string' ? item._id : `at-${path.join('-')}`);
const kindOf = (item: TreeItem): LinkKind => (typeof item.page === 'string' && item.page ? 'page' : typeof item.url === 'string' ? 'url' : 'none');

/** The menu's item fields that aren't the built-in ones, i.e. the site's own. */
function ownFields(fields: FieldMap): FieldMap {
  return Object.fromEntries(Object.entries(fields).filter(([key]) => !['_id', 'label', 'page', 'url', 'newTab', 'children'].includes(key)));
}

export function MenuInput({ field, value, onChange, path, context }: { field: AnyField; value: unknown; onChange: (value: unknown) => void; path: Path; context: FormContext }) {
  const config = field.config as MenuFieldConfig;
  const items = asItems(value);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [announcement, setAnnouncement] = useState('');
  // dnd-kit numbers its contexts in render order; a stable id keeps server and browser in step.
  const dndId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  // Titles of linked pages, for items' summaries.
  const idsKey = linkedPageIds(items).sort().join(',');
  const [pages, setPages] = useState<Map<string, PageOption>>(() => new Map());
  useEffect(() => {
    if (!idsKey || !context.findPages) return;
    let live = true;
    context.findPages({ ids: idsKey.split(',') }).then((found) => live && setPages(new Map(found.map((page) => [page.id, page]))));
    return () => {
      live = false;
    };
  }, [idsKey, context.findPages]);

  // Every item's path by its key, for drag and drop.
  const paths = useMemo(() => {
    const found = new Map<string, TreePath>();
    const walk = (list: TreeItem[], parent: TreePath) =>
      list.forEach((item, index) => {
        const itemPath = [...parent, index];
        found.set(keyOf(item, itemPath), itemPath);
        walk(asItems(item.children), itemPath);
      });
    walk(items, []);
    return found;
  }, [items]);

  const titleOf = (item: TreeItem) => {
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    const page = typeof item.page === 'string' ? pages.get(item.page) : undefined;
    return label || page?.title || (typeof item.url === 'string' && item.url) || 'New item';
  };

  const toggle = (key: string, force?: boolean) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (force ?? !next.has(key)) next.add(key);
      else next.delete(key);
      return next;
    });

  const add = (parent: TreePath) => {
    const item: TreeItem = { _id: newId(), label: '', newTab: false, children: [], ...defaultsFor(ownFields(config.fields)) };
    toggle(item._id as string, true);
    onChange(addTo(items, parent, item));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = paths.get(String(active.id));
    const to = paths.get(String(over.id));
    if (!from || !to) return;
    // Within a list only: the arrows move items in and out of submenus.
    if (from.slice(0, -1).join() !== to.slice(0, -1).join()) {
      setAnnouncement('Items move within their own list. Use the arrow buttons to move one into or out of a submenu.');
      return;
    }
    onChange(moveTo(items, from, to[to.length - 1]!));
    setAnnouncement(`${titleOf(itemAt(items, from)!)} moved to position ${to[to.length - 1]! + 1}.`);
  };

  const renderList = (list: TreeItem[], parent: TreePath): ReactNode => (
    <SortableContext items={list.map((item, index) => keyOf(item, [...parent, index]))} strategy={verticalListSortingStrategy}>
      <ol className="cera-menu-tree">
        {list.map((item, index) => {
          const itemPath = [...parent, index];
          return (
            <Row
              key={keyOf(item, itemPath)}
              id={keyOf(item, itemPath)}
              item={item}
              itemPath={itemPath}
              items={items}
              config={config}
              fieldPath={path}
              context={context}
              open={open.has(keyOf(item, itemPath))}
              title={titleOf(item)}
              page={typeof item.page === 'string' ? pages.get(item.page) : undefined}
              parentTitle={parent.length ? titleOf(itemAt(items, parent)!) : undefined}
              previousTitle={index > 0 ? titleOf(list[index - 1]!) : undefined}
              onToggle={() => toggle(keyOf(item, itemPath))}
              onChange={(next) => {
                onChange(next);
              }}
              onAddChild={() => {
                toggle(keyOf(item, itemPath), true);
                add(itemPath);
              }}
              onAnnounce={setAnnouncement}
            >
              {asItems(item.children).length > 0 && renderList(asItems(item.children), itemPath)}
            </Row>
          );
        })}
      </ol>
    </SortableContext>
  );

  return (
    <div className="cera-menu-builder">
      {items.length === 0 ? (
        <p className="cera-note">No items yet.</p>
      ) : (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ announcements: QUIET }}>
          {renderList(items, [])}
        </DndContext>
      )}
      <span className="cera-visually-hidden" aria-live="polite">
        {announcement}
      </span>
      {!context.readOnly && (
        <button type="button" className="cera-button cera-button--small" onClick={() => add([])}>
          Add item
        </button>
      )}
      <p className="cera-note">
        {config.depth > 1 ? `Up to ${config.depth} levels. ` : ''}Drag items by the handle to reorder them{config.depth > 1 ? '; the arrow buttons also move an item into or out of a submenu' : ''}. Links to pages
        that aren’t live are left out of the live site.
      </p>
    </div>
  );
}

const QUIET = { onDragStart: () => undefined, onDragOver: () => undefined, onDragEnd: () => undefined, onDragCancel: () => undefined };

interface RowProps {
  id: string;
  item: TreeItem;
  itemPath: TreePath;
  items: TreeItem[];
  config: MenuFieldConfig;
  fieldPath: Path;
  context: FormContext;
  open: boolean;
  title: string;
  page?: PageOption;
  parentTitle?: string;
  previousTitle?: string;
  onToggle: () => void;
  onChange: (items: TreeItem[]) => void;
  onAddChild: () => void;
  onAnnounce: (text: string) => void;
  children: ReactNode;
}

function Row({ id, item, itemPath, items, config, fieldPath, context, open, title, page, parentTitle, previousTitle, onToggle, onChange, onAddChild, onAnnounce, children }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: context.readOnly });
  const { readOnly } = context;
  const at = [...fieldPath, ...itemPath.flatMap((index, level) => (level === 0 ? [index] : ['children', index]))];
  const own = [...issuesAt(context.issues, [...at, 'label']), ...issuesAt(context.issues, [...at, 'url']), ...issuesAt(context.issues, [...at, 'page'])];
  const deeper = issuesAt(context.issues, [...at, 'children']).filter((issue) => issue.path.length === at.length + 1);
  const hasError = [...own, ...deeper].some((issue) => issue.severity === 'error');
  const siblings = siblingsAt(items, itemPath);
  const index = itemPath[itemPath.length - 1]!;
  const kind = kindOf(item);
  const set = (changes: Record<string, unknown>) => {
    const next: TreeItem = { ...item, ...changes };
    for (const [key, value] of Object.entries(changes)) if (value === undefined) delete next[key];
    onChange(replaceAt(items, itemPath, next));
  };
  const summary =
    kind === 'page' ? (page ? `${page.title || page.slug}${page.published ? '' : ' · not published'}` : 'A page') : kind === 'url' ? String(item.url || 'No address yet') : 'Heading: opens its submenu';

  const buttons = !readOnly && (
    <span className="cera-item-buttons">
      {config.depth > 1 && (
        <>
          <button
            type="button"
            className="cera-icon-button"
            aria-label={parentTitle ? `Move out of ${parentTitle}` : 'Move out'}
            title="Move out of the submenu"
            disabled={itemPath.length < 2}
            onClick={() => {
              onChange(outdent(items, itemPath));
              onAnnounce(`${title} moved out of ${parentTitle}.`);
            }}
          >
            ←
          </button>
          <button
            type="button"
            className="cera-icon-button"
            aria-label={previousTitle ? `Move into ${previousTitle}’s submenu` : 'Move into a submenu'}
            title="Move into the submenu of the item above"
            disabled={!canIndent(items, itemPath, config.depth)}
            onClick={() => {
              onChange(indent(items, itemPath));
              onAnnounce(`${title} moved into ${previousTitle}’s submenu.`);
            }}
          >
            →
          </button>
        </>
      )}
      <button type="button" className="cera-icon-button" aria-label={`Move ${title} up`} title="Move up" disabled={index === 0} onClick={() => onChange(moveTo(items, itemPath, index - 1))}>
        ↑
      </button>
      <button type="button" className="cera-icon-button" aria-label={`Move ${title} down`} title="Move down" disabled={index === siblings.length - 1} onClick={() => onChange(moveTo(items, itemPath, index + 1))}>
        ↓
      </button>
      <button
        type="button"
        className="cera-icon-button cera-danger"
        aria-label={`Remove ${title}`}
        title={Array.isArray(item.children) && item.children.length ? 'Remove, with its submenu' : 'Remove'}
        onClick={() => {
          onChange(removeAt(items, itemPath));
          onAnnounce(`${title} removed.`);
        }}
      >
        ✕
      </button>
    </span>
  );

  const fields = ownFields(config.fields);
  const labelId = `${id}-label`;
  return (
    <li ref={setNodeRef} className={`cera-menu-row${isDragging ? ' is-dragging' : ''}${hasError ? ' has-error' : ''}`} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <div className="cera-menu-row__head">
        {!readOnly && (
          <button type="button" className="cera-grip" ref={setActivatorNodeRef} aria-label={`Drag ${title}`} {...attributes} {...listeners}>
            <GripIcon />
          </button>
        )}
        <button type="button" className="cera-menu-row__toggle" aria-expanded={open || hasError} onClick={onToggle}>
          <span className="cera-item-title">{title}</span>
          <span className="cera-menu-row__summary">{summary}</span>
        </button>
        {buttons}
      </div>
      {(open || hasError) && (
        <div className="cera-menu-row__body">
          <div className="cera-fields">
            <div className="cera-field cera-field--text">
              <label htmlFor={labelId} className="cera-field__label">
                Label
              </label>
              <input
                id={labelId}
                type="text"
                maxLength={200}
                value={typeof item.label === 'string' ? item.label : ''}
                placeholder={page?.title || ''}
                readOnly={readOnly}
                onChange={(event) => set({ label: event.target.value })}
              />
              {kind === 'page' && <p className="cera-note">Empty: the page’s title.</p>}
              <IssueList issues={issuesAt(context.issues, [...at, 'label'])} />
            </div>
            <div className="cera-field" role="group" aria-labelledby={`${id}-link`}>
              <span id={`${id}-link`} className="cera-field__label">
                Links to
              </span>
              <div className="cera-segmented" role="radiogroup" aria-labelledby={`${id}-link`}>
                {(
                  [
                    ['page', 'A page'],
                    ['url', 'An address'],
                    ['none', 'Nothing'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={kind === value}
                    disabled={readOnly}
                    onClick={() => set(value === 'page' ? { url: undefined, page: kind === 'page' ? item.page : '' } : value === 'url' ? { page: undefined, url: kind === 'url' ? item.url : '' } : { page: undefined, url: undefined })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {kind === 'none' && <p className="cera-note">A heading: on the live site it opens its submenu, and is left out if it has none.</p>}
            </div>
            {kind === 'page' && (
              <div className="cera-field" role="group" aria-label="Page">
                <span className="cera-field__label">Page</span>
                {context.findPages ? (
                  <PagePicker
                    id={`${id}-page`}
                    field={PAGE_FIELD}
                    value={typeof item.page === 'string' && item.page ? [item.page] : []}
                    onChange={(ids) => set({ page: (Array.isArray(ids) && typeof ids[0] === 'string' ? ids[0] : '') as string })}
                    siblings={{}}
                    context={context}
                    findPages={context.findPages}
                  />
                ) : (
                  <input type="text" value={String(item.page ?? '')} readOnly={readOnly} placeholder="Page id" onChange={(event) => set({ page: event.target.value.trim() })} />
                )}
                <IssueList issues={issuesAt(context.issues, [...at, 'page'])} />
              </div>
            )}
            {kind === 'url' && (
              <div className="cera-field cera-field--url">
                <label htmlFor={`${id}-url`} className="cera-field__label">
                  Address
                </label>
                <input
                  id={`${id}-url`}
                  type="text"
                  className="cera-code"
                  value={typeof item.url === 'string' ? item.url : ''}
                  placeholder="https://… or /path"
                  readOnly={readOnly}
                  onChange={(event) => set({ url: event.target.value })}
                />
                <IssueList issues={issuesAt(context.issues, [...at, 'url'])} />
              </div>
            )}
            {kind !== 'none' && (
              <div className="cera-field cera-field--toggle">
                <label htmlFor={`${id}-tab`} className="cera-field__label">
                  New tab
                </label>
                <input id={`${id}-tab`} type="checkbox" checked={item.newTab === true} disabled={readOnly} onChange={(event) => set({ newTab: event.target.checked })} />
                <p className="cera-note">Opens the link in a new tab.</p>
              </div>
            )}
          </div>
          {Object.keys(fields).length > 0 && <FieldMapForm fields={fields} value={item} onChange={(next) => onChange(replaceAt(items, itemPath, next as TreeItem))} path={at} context={context} />}
          <IssueList issues={deeper} />
          {!readOnly && itemPath.length < config.depth && (
            <button type="button" className="cera-button cera-button--small" onClick={onAddChild}>
              Add an item under this one
            </button>
          )}
        </div>
      )}
      {children}
    </li>
  );
}
