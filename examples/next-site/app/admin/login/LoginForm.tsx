'use client';
import { useActionState } from 'react';
import { CeraLockup } from '@lateraltranslucence/cera/admin';
import { signInAction, type SignInState } from '../actions.ts';

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, {});
  const message = state.error ?? notice;
  return (
    <div className="cera-login">
      <CeraLockup href="/admin" size={40} />
      <form action={action} className="cera-login__card">
        <h1 className="cera-display" style={{ fontSize: 26, lineHeight: '30px', fontWeight: 600 }}>
          Sign in
        </h1>
        {message && (
          <p className="cera-status cera-status--error" role="alert">
            {message}
          </p>
        )}
        <label>
          Email
          <input name="email" type="text" inputMode="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className="cera-button cera-button--primary cera-button--lg" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
