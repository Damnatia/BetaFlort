import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

const SESSION_STORAGE_KEY = 'flort_member_session';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.user?.id && parsed?.user?.username) {
            setSession(parsed);
          }
        } catch {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    }
    setLoading(false);
    return () => {};
  }, []);

  async function signUp(username, password) {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    if (!normalizedUsername) {
      setStatus('Kullanıcı adı gerekli.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc('member_sign_up', {
      p_username: normalizedUsername,
      p_password: password,
    });
    if (error) {
      setStatus(`Kayıt hatası: ${error.message}`);
      setLoading(false);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id || !row?.username) {
      setStatus('Kayıt başarılı olmadı: üye bilgisi alınamadı.');
      setLoading(false);
      return;
    }

    const nextSession = { user: { id: row.id, username: row.username } };
    setSession(nextSession);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    }
    setStatus('Kayıt başarılı!');
    setLoading(false);
  }

  async function signIn(username, password) {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    if (!normalizedUsername) {
      setStatus('Kullanıcı adı gerekli.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc('member_sign_in', {
      p_username: normalizedUsername,
      p_password: password,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.id) {
      setStatus('Kullanıcı adı veya şifre hatalı.');
    } else {
      const nextSession = { user: { id: row.id, username: row.username } };
      setSession(nextSession);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
      }
      setStatus('Giriş yapıldı.');
    }
    setLoading(false);
  }

  async function signOut() {
    setSession(null);
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
