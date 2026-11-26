/**
 * The parts of create-cera that decide things, kept apart from the steps
 * that run commands, so they can be tested.
 */
import { createServer } from 'node:net';

/** The template's local Supabase ports are 563xx (Cera's own stack). */
export const TEMPLATE_PORT_BLOCK = 563;
/** And its dev server is on 3100 (the Cera example site). */
export const TEMPLATE_DEV_PORT = 3100;

/** The ports a Supabase stack in this block uses: 5xx20 to 5xx29. */
export function blockPorts(block) {
  return Array.from({ length: 10 }, (_, index) => block * 100 + 20 + index);
}

/** Whether nothing is listening on this TCP port (on any address). */
export function portIsFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '0.0.0.0');
  });
}

/**
 * A block of ports for the new site's Supabase stack: the first from 570 up
 * whose ten ports are all free. Supabase's default (543) and Cera's own
 * (563) are skipped even when free, so the site never clashes with a stack
 * that happens to be stopped right now. Null when none is free.
 */
export async function pickPortBlock(isFree = portIsFree, { from = 570, to = 649 } = {}) {
  for (let block = from; block <= to; block++) {
    if (block === TEMPLATE_PORT_BLOCK) continue;
    const free = await Promise.all(blockPorts(block).map((port) => isFree(port)));
    if (free.every(Boolean)) return block;
  }
  return null;
}

/** A dev server port: the first free one from 3101 (3100 is the Cera example's). */
export async function pickDevPort(isFree = portIsFree, { from = 3101, to = 3199 } = {}) {
  for (let port = from; port <= to; port++) if (await isFree(port)) return port;
  return null;
}

/**
 * A file's text with the template's ports moved: every 563xx to the new
 * block, and 3100 to the new dev port. Only whole numbers change, so 31000
 * or 456321 stay as they are.
 */
export function movePorts(text, { block, devPort }) {
  return text.replace(new RegExp(`\\b${TEMPLATE_PORT_BLOCK}(\\d\\d)\\b`, 'g'), `${block}$1`).replace(new RegExp(`\\b${TEMPLATE_DEV_PORT}\\b`, 'g'), String(devPort));
}

/**
 * The site's Supabase settings for its own stack: its project id, its ports,
 * and the edge runtime's inspector (8083 in the template) inside the block too.
 */
export function siteSupabaseConfig(text, { name, block, devPort }) {
  return movePorts(text, { block, devPort })
    .replace(/^project_id = ".*"$/m, `project_id = "${name}"`)
    .replace(/^inspector_port = \d+$/m, `inspector_port = ${block * 100 + 28}`);
}

/** An npm package name from a folder name: lowercase, no spaces. */
export function packageName(folderName) {
  return (
    folderName
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[._-]+|-+$/g, '') || 'cera-site'
  );
}

/** The folder quoted for a shell, when it needs it. */
export function shellQuote(text) {
  return /[^\w./-]/.test(text) ? `'${text.replaceAll("'", "'\\''")}'` : text;
}

/** Reads one KEY=value from an env file's text. */
export function envValue(text, key) {
  return new RegExp(`^${key}="?(.*?)"?$`, 'm').exec(text)?.[1];
}
