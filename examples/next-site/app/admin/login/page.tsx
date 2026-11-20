import { LoginForm } from './LoginForm.tsx';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <LoginForm notice={error === 'no-role' ? 'This account has no Cera role. Ask an admin to give it one.' : undefined} />;
}
