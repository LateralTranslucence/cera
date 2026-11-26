/**
 * Moving items around a menu's tree, for the admin's menu builder. Items are
 * the raw stored values (anything the item holds is kept), addressed by
 * path: [2] is the third top item, [2, 0] its first child.
 */
export type TreeItem = Record<string, unknown> & { children?: unknown };
export type TreePath = readonly number[];

const childrenOf = (item: unknown): TreeItem[] =>
  item && typeof item === 'object' && Array.isArray((item as TreeItem).children) ? ((item as TreeItem).children as TreeItem[]) : [];

/** The list that holds the item at `path`. */
export function siblingsAt(items: readonly TreeItem[], path: TreePath): readonly TreeItem[] {
  let list = items;
  for (const index of path.slice(0, -1)) list = childrenOf(list[index]);
  return list;
}

export function itemAt(items: readonly TreeItem[], path: TreePath): TreeItem | undefined {
  return siblingsAt(items, path)[path[path.length - 1]!];
}

/** A copy with the list holding `path` replaced by `change(list)`. */
function withSiblings(items: readonly TreeItem[], path: TreePath, change: (list: TreeItem[]) => TreeItem[]): TreeItem[] {
  if (path.length <= 1) return change([...items]);
  const [first, ...rest] = path;
  return items.map((item, index) => (index === first ? { ...item, children: withSiblings(childrenOf(item), rest, change) } : item));
}

/** Levels in an item's subtree: 1 for an item with no children. */
export function heightOf(item: unknown): number {
  return 1 + Math.max(0, ...childrenOf(item).map(heightOf));
}

export function replaceAt(items: readonly TreeItem[], path: TreePath, item: TreeItem): TreeItem[] {
  return withSiblings(items, path, (list) => list.map((existing, index) => (index === path[path.length - 1] ? item : existing)));
}

export function removeAt(items: readonly TreeItem[], path: TreePath): TreeItem[] {
  return withSiblings(items, path, (list) => list.filter((_, index) => index !== path[path.length - 1]));
}

/** Moves an item among its siblings, from its place to `to`. */
export function moveTo(items: readonly TreeItem[], path: TreePath, to: number): TreeItem[] {
  const from = path[path.length - 1]!;
  return withSiblings(items, path, (list) => {
    if (to < 0 || to >= list.length || to === from) return list;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved!);
    return list;
  });
}

/** Whether the item can become the last child of the sibling before it, within `maxDepth` levels. */
export function canIndent(items: readonly TreeItem[], path: TreePath, maxDepth: number): boolean {
  const index = path[path.length - 1]!;
  return index > 0 && path.length + heightOf(itemAt(items, path)) <= maxDepth;
}

/** Makes the item the last child of the sibling before it. */
export function indent(items: readonly TreeItem[], path: TreePath): TreeItem[] {
  const index = path[path.length - 1]!;
  const item = itemAt(items, path)!;
  return withSiblings(items, path, (list) => {
    const previous = list[index - 1]!;
    list[index - 1] = { ...previous, children: [...childrenOf(previous), item] };
    list.splice(index, 1);
    return list;
  });
}

/** Moves the item out of its parent, to just after it. */
export function outdent(items: readonly TreeItem[], path: TreePath): TreeItem[] {
  if (path.length < 2) return [...items];
  const item = itemAt(items, path)!;
  const parentPath = path.slice(0, -1);
  const without = removeAt(items, path);
  return withSiblings(without, parentPath, (list) => {
    list.splice(parentPath[parentPath.length - 1]! + 1, 0, item);
    return list;
  });
}

/** Adds an item at the end of the top level (`parent` empty) or of an item's children. */
export function addTo(items: readonly TreeItem[], parent: TreePath, item: TreeItem): TreeItem[] {
  if (parent.length === 0) return [...items, item];
  const owner = itemAt(items, parent)!;
  return replaceAt(items, parent, { ...owner, children: [...childrenOf(owner), item] });
}

/** Every page id the tree links to. */
export function linkedPageIds(items: readonly TreeItem[]): string[] {
  return items.flatMap((item) => [...(typeof item.page === 'string' && item.page ? [item.page] : []), ...linkedPageIds(childrenOf(item))]);
}
