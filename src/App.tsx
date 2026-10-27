import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase } from './lib/supabase';
import { Login } from './pages/Login';
import { Bills } from './pages/Bills';
import { Appliances } from './pages/Appliances';
import { Compare } from './pages/Compare';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0); // bumped when bills or appliances change, so the compare lists refresh
  const bump = () => setVersion((v) => v + 1);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!configured) return <main><h1>BillWise</h1><p className="err">Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p></main>;
  if (!ready) return <main><p>Loading...</p></main>;
  if (!session) return <main><Login /></main>;

  return (
    <main>
      <h1>BillWise</h1>
      <p className="muted">{session.user.email} - <button className="link" onClick={() => supabase.auth.signOut()}>Log out</button></p>
      <Bills onChange={bump} />
      <Appliances onChange={bump} />
      <Compare version={version} />
    </main>
  );
}
