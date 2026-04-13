import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

const SESSION_STORAGE_KEY = 'flort_member_session';

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
      setLoading(false);
    }
    if (typeof window !== 'undefined') bootstrap();
  }, []);

  async function signUp(username, password) {
    // KONTROL NOKTASI: Bu yazıyı tarayıcı konsolunda görmeliyiz!
    console.log("🚀 YENİ KAYIT SİSTEMİ ÇALIŞIYOR - YEDEK SİSTEM VE ENSURE_PROFILE DEVRE DIŞI!");

    const normalizedUsername = String(username || '').trim().toLowerCase();
    if (!normalizedUsername) {
      setStatus('Kullanıcı adı gerekli.');
      return { ok: false, error: 'Kullanıcı adı gerekli.' };
    }

    setLoading(true);
    
    // Doğrudan ve SADECE veritabanı fonksiyonunu çağırıyoruz
    const { data, error } = await supabase.rpc('member_sign_up', {
      p_username: normalizedUsername,
      p_password: password,
    });
    
    if (error) {
      console.error("RPC HATASI:", error); // Gerçek hatayı konsola basıyoruz
      const lowered = String(error?.message || '').toLowerCase();
      if (error?.code === '23505' || lowered.includes('duplicate') || lowered.includes('username_taken')) {
        setStatus('Bu kullanıcı adı zaten kayıtlı. Giriş yapmayı deneyin.');
      } else {
        setStatus(`Kayıt hatası: ${error.message}`);
      }
      setLoading(false);
      return { ok: false, error: error.message };
    }

    let row = Array.isArray(data) ? data[0] : data;
    if (!row?.id || !row?.username) {
      setStatus('Kayıt başarılı olmadı: üye bilgisi alınamadı.');
      setLoading(false);
      return { ok: false, error: 'Üye bilgisi eksik.' };
    }

    // Profil veritabanı tetikleyicisi tarafından anında oluşturuldu.
    // Oturumu kaydedip giriş yapıyoruz.
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

    if (error || !row?.id) {
       setStatus(error ? `Giriş hatası: ${error.message}` : 'Kullanıcı adı veya şifre hatalı.');
       setLoading(false);
       return { ok: false, error: error?.message || 'Hatalı giriş.' };
    } else {
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
    setSession(null);
    if (typeof window !== 'undefined') window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setStatus('Çıkış yapıldı.');
  }

  return { session, user: session?.user, loading, status, signIn, signUp, signOut };
}
