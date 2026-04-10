# Flort Chat (Vite + Supabase)

Bu sürümde admin ve üyeler profil fotoğrafı yükleyebilir.

## Özellikler
- Kullanıcı kaydı/girişi: sadece kullanıcı adı + şifre
- Admin girişi: sadece şifre
- Admin sanal profil oluştururken: ad, yaş, cinsiyet, hobiler + **fotoğraf**
- Üye giriş yaptıktan sonra kendi profilini düzenler: yaş, hobiler, şehir + **fotoğraf**
- Üye -> sadece sanal profillere mesaj atabilir
- Admin paneli: tek cevap penceresi + konuşma geçmişini görme
- Mesajlar admin ve üyede **realtime** güncellenir
- Mesaj balonlarında kuyruk, yumuşak slide-in animasyonu ve WhatsApp tarzı mavi tik görüldü ikonları
- Supabase Presence ile canlılık: admin yazıyor göstergesi + profil bazlı online yeşil nokta
- Profil listesinde yeni mesaj gelen avatarlarda dönen gradient ring (story efekti)
- Admin için hızlı yanıt chip'leri ve opsiyonel AI öneri butonu (`VITE_OPENAI_API_KEY`)
- Mesaj içeriği `audio:https://...mp3` veya direkt ses URL'si ise chat içinde audio player görünür
- Admin panelde tek tuşla rastgele kadın profil taslağı (250 modern isim havuzu + şehir + yaş)

## Kurulum
1. Proje kökündeki `.env` dosyasında şu değişkenleri güncelle:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADMIN_PASSWORD`
   - `VITE_ADMIN_PASSWORD2` (opsiyonel, ikinci admin girişi için)
   - `VITE_OPENAI_API_KEY` (opsiyonel, AI önerileri için)
2. `supabase/schema.sql` dosyasını SQL Editor'de çalıştır. (Eski şemalardan migration + storage bucket/policy kurulumu yapar, tekrar çalıştırılabilir)
3. Uygulamayı başlat:
   - `npm install`
   - `npm run dev`

> Eğer `Could not find the 'photo_url' column of 'virtual_profiles'` hatası alırsan, `supabase/schema.sql` scriptini tekrar çalıştır.

## Yeni Migration İçeriği
- `member_profiles` tablosu
- `virtual_profiles.photo_url` + `virtual_profiles.city` kolonları
- `member_profiles.status_emoji` kolonu
- `profile-images` storage bucket + policy'ler
- `engagement_events` tablosu (admin analytics için)
- `thread_quick_facts` tablosu (thread bazlı hızlı not defteri)

## SQL Çalıştırma Notu (Önemli)
- Supabase SQL Editor'e **git diff çıktısı** (`@@`, `+++`, `---`) yapıştırmayın.
- Direkt olarak `supabase/schema.sql` dosyasının ham içeriğini çalıştırın.
- Eğer `@@ ...` benzeri syntax hatası alırsanız, güvenli alternatif olarak `supabase/schema.clean.sql` dosyasını çalıştırın.
- `schema.clean.sql` dosyası engagement + quick facts dahil tüm güncel şemayı tek seferde kurar.

## Önemli Not (Güvenlik)
Bu yapı demo/prototip içindir. Son güncellemede `members.password` kaldırıldı; şifreler `pgcrypto` ile hashlenmiş şekilde (`password_hash`) saklanır.



## RLS Redesign (P0)
- `*_all_anon` politikalarını kaldırıp owner/admin scoped policy'lere geçmek için Supabase SQL Editor'de `supabase/rls_redesign_p0.sql` dosyasını çalıştır.
- Bu script `public.is_admin()` helper fonksiyonunu oluşturur ve tüm kritik tablolar için sadece `authenticated` + owner/admin erişimi bırakır.

## Stripe Checkout (Coin Satın Alma)
- Coin satın al butonu checkout başlatırken otomatik olarak `/api/create-checkout-session` endpointini çağırır.
- Admin panelinde checkout endpoint manuel girilmez.
- Güvenlik: Stripe secret key’leri veritabanında tutulmaz. `api_key` / `api_secret` kolonları kaldırılmıştır; sadece sunucu env değişkenleri kullanılır.
- Vercel env değişkenleri:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `VITE_STRIPE_PUBLIC_KEY` (opsiyonel, frontend kullanımına göre)
  - `STRIPE_CURRENCY` (opsiyonel, varsayılan: `try`)
  - `STRIPE_UNIT_AMOUNT_PER_COIN` (opsiyonel, varsayılan: `10`)
  - `APP_BASE_URL` (opsiyonel; success/cancel URL üretiminde kullanılır)
- Ödeme sonrası coin yükleme için Stripe webhook’unuzu `https://flortbeta.vercel.app/api/webhook` endpoint’ine yönlendirin. Endpoint, `STRIPE_WEBHOOK_SECRET` ile Stripe imzasını doğrular ve `checkout.session.completed` event metadata’sındaki `member_id` + `coin_amount` ile bakiyeyi günceller.
- Endpoint ayrıca imza doğrulaması başarısız olursa Stripe Event API (`STRIPE_SECRET_KEY`) üzerinden event doğrulaması yapar; bu sayede bazı hosting body parse farklarında webhook akışı daha dayanıklı çalışır.

## Vercel Deploy
- Framework: **Vite**
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment Variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_ADMIN_PASSWORD`
  - `VITE_ADMIN_PASSWORD2` (opsiyonel)
   - `VITE_OPENAI_API_KEY` (opsiyonel, AI önerileri için)


## Realtime Notu
Supabase Dashboard -> Database -> Replication bölümünde `messages` tablosunun realtime için açık olduğundan emin olun.
`admin_threads` artık TABLE olarak tutulur; realtime publication'a eklenebilir ve admin panelde canlı thread listesi sağlar.
