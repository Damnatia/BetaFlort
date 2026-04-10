import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

const initialAuth = { username: '', password: '' };

export function useAuth({ adminPasswords = [], setStatus }) {
  const [mode, setMode] = useState('user');
  const [authForm, setAuthForm] = useState(initialAuth);
  const [loading, setLoading] = useState(false);
  const [memberSession, setMemberSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const savedMode = window.localStorage.getItem('auth_mode');
      const savedAdmin = window.localStorage.getItem('is_admin_session') === 'true';
      const savedMember = window.localStorage.getItem('member_session');
      if (savedMode === 'admin' || savedMode === 'user') setMode(savedMode);
      if (savedAdmin) setIsAdmin(true);
      if (savedMember) setMemberSession(JSON.parse(savedMember));
    } catch {
      // sessizce geç
    }
  }, []);

  async function signUp() {
    if (mode === 'admin') return setStatus('Admin kayıt olamaz.');
    if (!authForm.username || !authForm.password) return setStatus('Kullanıcı adı ve şifre zorunlu.');

    setLoading(true);
    setStatus('');

    const username = authForm.username.trim();
    const password = authForm.password;

    const { data: createdMember, error } = await supabase
      .rpc('member_sign_up', {
        p_username: username,
        p_password: password,
      })
      .single();

    setLoading(false);
    if (error) return setStatus(`Kayıt başarısız: ${error.message}`);
    if (!createdMember?.id) return setStatus('Kayıt başarısız: beklenmeyen yanıt.');

    setMemberSession(createdMember);
    setIsAdmin(false);
    window.localStorage.setItem('is_admin_session', 'false');
    window.localStorage.setItem('member_session', JSON.stringify(createdMember));
    setStatus('Kayıt başarılı, otomatik giriş yapıldı.');
  }

  async function signIn() {
    setLoading(true);
    setStatus('');

    if (mode === 'admin') {
      const validAdminPasswords = adminPasswords.filter(Boolean);
      if (!validAdminPasswords.length) {
        setLoading(false);
        return setStatus('VITE_ADMIN_PASSWORD / VITE_ADMIN_PASSWORD2 eksik.');
      }
      if (!validAdminPasswords.includes(authForm.password)) {
        setLoading(false);
        return setStatus('Admin şifresi hatalı.');
      }
      setIsAdmin(true);
      setMemberSession(null);
      window.localStorage.setItem('is_admin_session', 'true');
      window.localStorage.removeItem('member_session');
      setLoading(false);
      return setStatus('Admin girişi başarılı.');
    }

    if (!authForm.username || !authForm.password) {
      setLoading(false);
      return setStatus('Kullanıcı adı ve şifre girmen gerekiyor.');
    }

    const { data, error } = await supabase
      .rpc('member_sign_in', {
        p_username: authForm.username.trim(),
        p_password: authForm.password,
      })
      .single();

    setLoading(false);
    if (error || !data) return setStatus('Kullanıcı adı veya şifre hatalı.');

    setMemberSession(data);
    setIsAdmin(false);
    window.localStorage.setItem('is_admin_session', 'false');
    window.localStorage.setItem('member_session', JSON.stringify(data));
    setStatus('Giriş başarılı.');
  }

  function signOut(onAfterSignOut) {
    setMemberSession(null);
    setIsAdmin(false);
    window.localStorage.removeItem('is_admin_session');
    window.localStorage.removeItem('member_session');
    if (typeof onAfterSignOut === 'function') {
      onAfterSignOut();
    }
    setStatus('Çıkış yapıldı.');
  }

  function toggleMode(nextMode) {
    setMode(nextMode);
    window.localStorage.setItem('auth_mode', nextMode);
  }

  return {
    mode,
    setMode: toggleMode,
    authForm,
    setAuthForm,
    loading,
    memberSession,
    isAdmin,
    signIn,
    signUp,
    signOut,
  };
}
