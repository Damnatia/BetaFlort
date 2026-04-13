import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

const SESSION_STORAGE_KEY = 'flort_member_session';

function isMissingRpcError(error) {
  const message = String(error?.message || '');
  return error?.code === 'PGRST202' || message.includes('Could not find the function');
}

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    async function bootstrap() {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.user?.id && parsed?.user?.username) {
            setSession(parsed);
            setLoading(false);
            return;
          }
        } catch {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }

      // RPC şeması kurulmadan auth fallback'e düşülmüş eski hesaplar için
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (authSession?.user?.id) {
        const fallbackUsername = authSession.user.user_metadata?.username
          || authSession.user.email?.split('@')[0]
          || 'member';
        const nextSession = { user: { id: authSession.user.id, username: fallbackUsername } };
        setSession(nextSession);
      }
      setLoading(false);
    }

    if (typeof window !== 'undefined') {
      bootstrap();
    } else {
      setLoading(false);
    }
    return () => {};
  }, []);

  async function signUp(username, password) {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    if (!normalizedUsername) {
      setStatus('Kullanıcı adı gerekli.');
      return { ok: false, error: 'Kullanıcı adı gerekli.' };
    }

    setLoading(true);
    // 1. Doğrudan veritabanı fonksiyonunu çağırıyoruz
    const { data, error } = await supabase.rpc('member_sign_up', {
      p_username: normalizedUsername,
      p_password: password,
    });
    
    let row = Array.isArray(data) ? data[0] : data;
    let activeError = error;

    if (activeError) {
      const lowered = String(activeError?.message || '').toLowerCase();
      if (
        activeError?.code === '23505'
        || lowered.includes('duplicate')
        || lowered.includes('username_taken')
      ) {
        setStatus('Bu kullanıcı adı zaten kayıtlı. Giriş yapmayı deneyin.');
      } else {
        setStatus(`Kayıt hatası: ${activeError.message}`);
      }
      setLoading(false);
      return { ok: false, error: String(activeError?.message || 'signup_failed') };
    }

    if (!row?.id || !row?.username) {
      setStatus('Kayıt başarılı olmadı: üye bilgisi alınamadı.');
      setLoading(false);
      return { ok: false, error: 'Kayıt başarılı olmadı: üye bilgisi alınamadı.' };
    }

    // VERİTABANI TRİGGER'I PROFİLİ ZATEN OLUŞTURDU. 
    // Önceden burada olan ensureMemberProfile adımını yetki çakışması yapmaması için kaldırdık.

    // 2. Oturumu tarayıcıya kaydet ve giriş yap
    const nextSession = { user: { id: row.id, username: row.username } };
    setSession(nextSession);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    }
    setStatus('Kayıt başarılı!');
    setLoading(false);
    return { ok: true };
  }

  async function signIn(username, password) {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    if (!normalizedUsername) {
      setStatus('Kullanıcı adı gerekli.');
      return { ok: false, error: 'Kullanıcı adı gerekli.' };
    }

    setLoading(true);
    const { data, error } = await supabase.rpc('member_sign_in', {
      p_username: normalizedUsername,
      p_password: password,
    });
    
    let row = Array.isArray(data) ? data[0] : data;
    let activeError = error;

    if (activeError || !row?.id) {
      if (activeError && !isMissingRpcError(activeError)) {
         setStatus(`Giriş hatası: ${activeError.message}`);
      } else {
         setStatus('Kullanıcı adı veya şifre hatalı.');
      }
      setLoading(false);
      return { ok: false, error: activeError?.message || 'Kullanıcı adı veya şifre hatalı.' };
    } else {
      
      // Önceden burada olan ensureMemberProfile adımını kaldırdık.
      
      const nextSession = { user: { id: row.id, username: row.username } };
      setSession(nextSession);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
      }
      setStatus('Giriş yapıldı.');
    }
    setLoading(false);
    return { ok: true };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    setStatus('Çıkış yapıldı.');
  }

  return {
    session,
    user: session?.user, 
    loading,
    status,
    signIn,
    signUp,
    signOut,
  };
}
