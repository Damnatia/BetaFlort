import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

const SESSION_STORAGE_KEY = 'flort_member_session';
const USERNAME_EMAIL_DOMAIN = 'member.flort.local';

function usernameToEmail(username) {
  return `${String(username || '').trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

function isMissingRpcError(error) {
  const message = String(error?.message || '');
  return error?.code === 'PGRST202' || message.includes('Could not find the function');
}

async function ensureMemberProfile(memberId, username) {
  if (!memberId) return { ok: true };

  const normalizedUsername = String(username || '').trim().toLowerCase();
  try {
    const { error: memberError } = await supabase
      .from('members')
      .upsert({
        id: memberId,
        username: normalizedUsername || `member_${String(memberId).replace(/-/g, '').slice(0, 16)}`,
        password_hash: 'managed_by_auth_flow',
      }, { onConflict: 'id', ignoreDuplicates: true });

    if (memberError) {
      return { ok: false, error: `members_sync_failed:${memberError.message}` };
    }

    const { error: profileError } = await supabase
      .from('member_profiles')
      .upsert({
        member_id: memberId,
        coin_balance: 100,
        status_emoji: '🙂',
      }, { onConflict: 'member_id' });

    if (profileError) {
      return { ok: false, error: `member_profiles_sync_failed:${profileError.message}` };
    }

    return { ok: true };
  } catch (profileSyncError) {
    return { ok: false, error: profileSyncError?.message || 'member_profile_sync_unknown' };
  }
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

      // RPC şeması kurulmadan auth fallback'e düşülmüş hesaplar için
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
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc('member_sign_up', {
      p_username: normalizedUsername,
      p_password: password,
    });
    let row = Array.isArray(data) ? data[0] : data;
    let activeError = error;

    if (activeError && isMissingRpcError(activeError)) {
      const email = usernameToEmail(normalizedUsername);
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: normalizedUsername } },
      });
      if (authError) {
        setStatus(`Kayıt hatası: ${authError.message}`);
        setLoading(false);
        return;
      }
      row = { id: authData?.user?.id, username: normalizedUsername };
      activeError = null;
    } else if (activeError) {
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
      return;
    }

    if (!row?.id || !row?.username) {
      setStatus('Kayıt başarılı olmadı: üye bilgisi alınamadı.');
      setLoading(false);
      return;
    }

    const profileSync = await ensureMemberProfile(row.id, row.username);
    if (!profileSync.ok) {
      setStatus(`Kayıt tamamlandı ama profil oluşturulamadı: ${profileSync.error}`);
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
    let row = Array.isArray(data) ? data[0] : data;
    let activeError = error;

    if (activeError && isMissingRpcError(activeError)) {
      const email = usernameToEmail(normalizedUsername);
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError || !authData?.user?.id) {
        setStatus('Kullanıcı adı veya şifre hatalı.');
        setLoading(false);
        return;
      }
      row = { id: authData.user.id, username: normalizedUsername };
      activeError = null;
    }

    if (activeError || !row?.id) {
      setStatus('Kullanıcı adı veya şifre hatalı.');
    } else {
      const profileSync = await ensureMemberProfile(row.id, row.username);
      if (!profileSync.ok) {
        setStatus(`Giriş yapıldı ama profil senkronu başarısız: ${profileSync.error}`);
        setLoading(false);
        return;
      }
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
    await supabase.auth.signOut();
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
