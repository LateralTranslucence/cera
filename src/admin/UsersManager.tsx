'use client';
/**
 * The People page: who can use the admin, with what role, and a form to add
 * someone. Sites pass server actions that wrap `createCeraUser` and
 * `setCeraRole` from ./supabase, each checking that the caller is an admin.
 *
 * A new account gets a temporary password, shown here once for the admin to
 * pass on privately; the person changes it after signing in.
 */
import { useState, useTransition, type FormEvent } from 'react';
import { CERA_ROLE_LABELS, CERA_ROLES, type CeraRole, type CeraUser } from '../roles.ts';

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

export interface UsersManagerProps {
  users: CeraUser[];
  /** The signed-in admin; their own role can't be changed here. */
  currentUserId: string;
  onCreate: (input: { email: string; role: CeraRole }) => Promise<Result<{ user: CeraUser; password: string }>>;
  onSetRole: (input: { userId: string; role: CeraRole | null }) => Promise<Result<{ user: CeraUser }>>;
  /** Called after a change, e.g. to refresh the server-rendered list. */
  onChanged?: () => void;
}

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });
const roleName = (role: CeraRole) => role[0]!.toUpperCase() + role.slice(1);

type Status = { kind: 'success' | 'error'; text: string } | null;

/** "an admin", "an editor", "a viewer". */
const withArticle = (role: CeraRole) => `${/^[aeiou]/.test(role) ? 'an' : 'a'} ${role}`;

export function UsersManager({ users: initial, currentUserId, onCreate, onSetRole, onChanged }: UsersManagerProps) {
  const [users, setUsers] = useState(initial);
  const [status, setStatus] = useState<Status>(null);
  const [created, setCreated] = useState<{ email: string; role: CeraRole; password: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CeraRole>('editor');

  const replace = (user: CeraUser) => setUsers((list) => list.map((u) => (u.id === user.id ? user : u)));

  function changeRole(user: CeraUser, next: CeraRole | null) {
    if (next === null && !window.confirm(`Remove ${user.email}’s access to the admin? Their account stays; you can give access again later.`)) return;
    setStatus(null);
    startTransition(async () => {
      const result = await onSetRole({ userId: user.id, role: next });
      if (result.ok) {
        replace(result.user);
        setStatus({ kind: 'success', text: next ? `${user.email} is now ${withArticle(next)}.` : `${user.email} no longer has access.` });
        onChanged?.();
      } else {
        setStatus({ kind: 'error', text: result.message });
      }
    });
  }

  function add(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    setCreated(null);
    startTransition(async () => {
      const result = await onCreate({ email, role });
      if (result.ok) {
        setUsers((list) => [...list, result.user]);
        setCreated({ email: result.user.email, role: result.user.role ?? role, password: result.password });
        setEmail('');
        onChanged?.();
      } else {
        setStatus({ kind: 'error', text: result.message });
      }
    });
  }

  const withAccess = users.filter((u) => u.role);
  const without = users.filter((u) => !u.role);

  return (
    <div className="cera-users">
      {status && (
        <p className={`cera-status cera-status--${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>
          {status.text}
        </p>
      )}

      <section className="cera-section">
        <h2>Add a person</h2>
        <form className="cera-users__add" onSubmit={add}>
          <label className="cera-inline">
            Email
            <input type="email" required value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </label>
          <label className="cera-inline">
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as CeraRole)}>
              {CERA_ROLES.map((r) => (
                <option key={r} value={r}>
                  {CERA_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="cera-button cera-button--primary" disabled={pending}>
            {pending ? 'Adding…' : 'Add'}
          </button>
        </form>
        {created && (
          <div className="cera-status cera-status--success cera-users__created" role="status">
            <p>
              Added <strong>{created.email}</strong> as {withArticle(created.role)}. Their temporary password:
            </p>
            <p className="cera-users__password">
              <code>{created.password}</code>
              <button type="button" className="cera-button cera-button--small" onClick={() => void navigator.clipboard?.writeText(created.password)}>
                Copy
              </button>
            </p>
            <p>Send it to them privately. They sign in at this admin and change it under Account. It won’t be shown again.</p>
          </div>
        )}
      </section>

      <section className="cera-section">
        <h2>People with access</h2>
        <UserTable users={withAccess} currentUserId={currentUserId} pending={pending} onRole={changeRole} />
      </section>

      {without.length > 0 && (
        <section className="cera-section">
          <details>
            <summary>
              <h2>Other accounts ({without.length})</h2>
            </summary>
            <p className="cera-note">These accounts exist in Supabase but can’t use the admin. Give one a role to let them in.</p>
            <UserTable users={without} currentUserId={currentUserId} pending={pending} onRole={changeRole} />
          </details>
        </section>
      )}
    </div>
  );
}

function UserTable({
  users,
  currentUserId,
  pending,
  onRole,
}: {
  users: CeraUser[];
  currentUserId: string;
  pending: boolean;
  onRole: (user: CeraUser, role: CeraRole | null) => void;
}) {
  if (users.length === 0) return <p className="cera-note">Nobody yet.</p>;
  return (
    <table className="cera-table">
      <thead>
        <tr>
          <th>Email</th>
          <th>Role</th>
          <th className="cera-hide-sm">Last sign-in</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => {
          const self = u.id === currentUserId;
          return (
            <tr key={u.id}>
              <td>
                {u.email || <span className="cera-note">(no email)</span>}
                {self && <span className="cera-badge">You</span>}
              </td>
              <td>
                {self ? (
                  roleName(u.role!)
                ) : (
                  <select
                    aria-label={`Role for ${u.email}`}
                    value={u.role ?? ''}
                    disabled={pending}
                    onChange={(e) => onRole(u, e.target.value ? (e.target.value as CeraRole) : null)}
                  >
                    {!u.role && <option value="">No access</option>}
                    {CERA_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleName(r)}
                      </option>
                    ))}
                    {u.role && <option value="">Remove access</option>}
                  </select>
                )}
              </td>
              <td className="cera-hide-sm">{u.lastSignInAt ? dateFormat.format(new Date(u.lastSignInAt)) : 'Never'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
