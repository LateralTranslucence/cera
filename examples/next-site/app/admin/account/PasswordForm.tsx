'use client';
import { useActionState } from 'react';
import { changePasswordAction, type PasswordState } from '../actions.ts';

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="cera-password-form">
      <label className="cera-inline">
        New password
        <input type="password" name="password" required minLength={12} autoComplete="new-password" />
      </label>
      <label className="cera-inline">
        New password again
        <input type="password" name="confirm" required minLength={12} autoComplete="new-password" />
      </label>
      <button type="submit" className="cera-button cera-button--primary" disabled={pending}>
        {pending ? 'Saving…' : 'Change password'}
      </button>
      {state.error && (
        <p className="cera-status cera-status--error" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="cera-status cera-status--success" role="status">
          Password changed.
        </p>
      )}
    </form>
  );
}
