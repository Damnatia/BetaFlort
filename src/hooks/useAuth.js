import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

const USERNAME_EMAIL_DOMAIN = 'member.flort.local';
const SESSION_STORAGE_KEY = 'flort_member_username';

function usernameToEmail(username) {
  return `${String(username || '').trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const savedUsername = typeof window !== 'undefined'
      ? window.localStorage.getItem(SESSION_STORAGE_KEY)
      : '';

    function withUsername(nextSession) {
      if (!nextSession?.user) return nextSession;
      const fallbackUsername = nextSession.user.email?.split('@')[0] || '';
      const username = savedUsername || nextSession.user.user_metadata?.username || fallbackUsername;
      return {
        ...nextSession,
        user: {
          ...nextSession.user,
          username,
        },
      };
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(withUsername(session));
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(withUsername(nextSession));
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signUp(username, password) {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const email = usernameToEmail(normalizedUsername);
    if (!normalizedUsername) {
      setStatus('Kullanıcı adı gerekli.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: normalizedUsername },
      },
    });
    if (error) {
      setStatus(`Kayıt hatası: ${error.message}`);
      setLoading(false);
      return;
    }

    if (!data?.user?.id) {
      setStatus('Kayıt oluşturuldu ancak kullanıcı bilgisi alınamadı.');
      setLoading(false);
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SESSION_STORAGE_KEY, normalizedUsername);
    }
    setStatus('Kayıt başarılı!');
    setLoading(false);
  }

  async function signIn(username, password) {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const email = usernameToEmail(normalizedUsername);
    if (!normalizedUsername) {
      setStatus('Kullanıcı adı gerekli.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus('Kullanıcı adı veya şifre hatalı.');
    } else {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SESSION_STORAGE_KEY, normalizedUsername);
      }
      setStatus('Giriş yapıldı.');
    }
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    setStatus('Çıkış yapıldı.');
  }

  return {
    session,
    user: session?.user, // Oturum açan kullanıcının UUID'si user.id içinde olacak
    loading,
    status,
    signIn,
    signUp,
    signOut,
  };
}
