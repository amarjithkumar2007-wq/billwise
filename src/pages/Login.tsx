import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const { error, data } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (error) setMsg({ text: error.message, ok: false });
    else if (mode === 'up' && !data.session) setMsg({ text: 'Check your email to confirm, then log in.', ok: true });
  }

  return (
    <form className="card" onSubmit={submit}>
      <h1>BillWise</h1>
      <p className="muted">Why did my electricity bill go up?</p>
      <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password (min 8)<input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button type="submit">{mode === 'in' ? 'Log in' : 'Create account'}</button>{' '}
      <button type="button" className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
        {mode === 'in' ? 'New here? Sign up' : 'Have an account? Log in'}
      </button>
      {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
    </form>
  );
}
