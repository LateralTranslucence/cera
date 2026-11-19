'use client';
import { useActionState } from 'react';
import { signInAction, type SignInState } from '../actions.ts';

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, {});
  const message = state.error ?? notice;
  return (
    <form action={action} className="cera-login">
      <h1>Cera admin</h1>
      {message && (
        <p className="cera-status cera-status--error" role="alert">
          {message}
        </p>
      )}
      <div className="cera-field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="text" inputMode="email" autoComplete="username" required />
      </div>
      <div className="cera-field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button type="submit" className="cera-button cera-button--primary" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
