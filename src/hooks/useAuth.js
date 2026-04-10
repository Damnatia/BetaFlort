import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    // Sayfa açıldığında mevcut oturumu kontrol et
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Oturum değişikliklerini (giriş, çıkış, token yenilenme) anlık dinle
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Supabase Auth Email/Şifre ile Kayıt
  async function signUp(email, password) {
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setStatus(`Kayıt hatası: ${error.message}`);
    else setStatus('Kayıt başarılı!');
    setLoading(false);
  }

  // Supabase Auth Email/Şifre ile Giriş
  async function signIn(email, password) {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setStatus('E-posta veya şifre hatalı.');
    else setStatus('Giriş yapıldı.');
    setLoading(false);
  }

  // Güvenli Çıkış
  async function signOut() {
    await supabase.auth.signOut();
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
