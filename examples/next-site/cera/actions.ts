'use server';
/**
 * The admin's one server action: runs the admin action it's named
 * (createAdminActions, through cera.runAction), which checks the signed-in
 * person's role itself. Only names Cera defines are run.
 */
import type { AdminActionName } from '@lateraltranslucence/cera/admin';
import { cera } from './admin.tsx';

export async function ceraAction(name: AdminActionName, ...args: unknown[]): Promise<unknown> {
  return cera.runAction(name, args);
}
