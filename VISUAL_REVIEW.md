# Görsel Yenilik İnceleme Notları

Bu not, mevcut `src/App.jsx` ve `src/styles.css` yapısına göre hazırlanmış **UI/UX odaklı görsel geliştirme önerileri** içerir.

## 1) Tasarım sistemi ve tutarlılık

- Uygulama şu an çok sayıda ekran/parça içeriyor (discover, chat, admin drawer, moderasyon vb.). Renk, radius, gölge, spacing ve typography için merkezi bir “design token” katmanı oluşturmak bakım maliyetini düşürür.
- Tailwind kullanıldığı için aşağıdakileri tokenlaştırmak iyi olur:
  - Renk rollerı: `primary`, `secondary`, `surface`, `surface-muted`, `success`, `warning`, `danger`
  - Radius: `sm/md/lg/xl`
  - Shadow seviyeleri: `elevation-1/2/3`
  - Spacing scale: 4-8-12-16-24-32 gibi sabit ritim

## 2) Görsel hiyerarşi güçlendirme

- Admin paneli metrikleri (`adminStats`) ve bekleyen thread KPI’ları (`slaStats`) için “dashboard kartları” eklenebilir.
- Bu kartlarda:
  - Büyük sayı + küçük açıklama
  - Son 24 saat farkı (↑% / ↓%)
  - Renk kodlu durum etiketi
- Böylece admin tarafında bilgi yoğunluğu artarken taranabilirlik de yükselir.

## 3) Discover ekranını modernleştirme

- `discoverProfiles` üzerinde zaten filtre/sıralama var; kart görünümü daha güçlü hale getirilebilir:
  - Görsel üstünde gradient overlay + isim/şehir alt bilgi
  - Ortak ilgi oranı için progress bar veya halka gösterge
  - “Online” rozeti + hafif pulse animasyonu
- “Spotlight” (`spotlightProfiles`) alanı için yatay carousel ile premium/öne çıkan profil deneyimi eklenebilir.

## 4) Mesajlaşma deneyimi iyileştirmeleri

- Chat bubble tail mevcut, iyi bir temel. Ek olarak:
  - Gelen/giden mesaj için hafif ton farkı (kontrast erişilebilirliğini koruyarak)
  - Saat, gönderim durumu ve okunma bilgisini daha mikro-tipografiyle sağ altta sabitleme
  - Sesli mesaj ve normal mesaj kartlarını görsel olarak daha net ayırma
- Uzun konuşmalarda “Tarihe göre ayırıcı” (bugün/dün/12 Nisan) deneyimi okunabilirliği artırır.

## 5) Mikro-etkileşimler (subtle motion)

- Halihazırda `fadeIn` animasyonu var; buna ek olarak:
  - Buton hover’da 120-180ms transform + shadow transition
  - Kartlarda hover lift (`translateY(-2px)`) ve focus ring
  - Thread seçimi sırasında yumuşak arka plan geçişi
- Not: Animasyonları “subtle” tutup performans için `transform/opacity` önceliklenmeli.

## 6) Karanlık tema (dark mode)

- Mevcut arka plan açık tona optimize edilmiş (`body bg-[#F4F7FB]`).
- `dark:` varyantları ile iki temalı kullanım önerilir:
  - Chat ekranlarında OLED dostu koyu yüzey
  - Kontrastı WCAG AA seviyesinde tutan metin renkleri
- Admin kullanıcıları için gece vardiyasında ciddi kullanım konforu sağlar.

## 7) Boş/durum ekranları

- Thread, discover ve moderasyon alanlarında boş durumda sadece metin yerine illüstrasyon + eylem butonu kullanılabilir.
- Örnek:
  - “Henüz eşleşme yok” → “Keşfetmeye başla”
  - “Bekleyen mesaj yok” → “Filtreyi genişlet”

## 8) Mobil ergonomi

- Bu tür sohbet uygulamasında başparmak erişimi kritik:
  - Ana aksiyon butonlarını alt bölgeye yakın tut
  - Input + gönder butonu yüksekliğini en az 44px yap
  - Drawer ve filtre alanında tam ekran sheet deseni (özellikle admin tarafı)

## 9) Erişilebilirlik (a11y) odaklı görsel kalite

- Sadece renk ile durum anlatımını azaltıp ikon+metin kombinasyonu kullanın.
- Focus state’ler belirgin olmalı (keyboard kullanımında görünür ring).
- Renk kontrastlarını özellikle açık gri metinlerde kontrol edin.

## 10) Hızlı uygulanabilir “ilk sprint” öneri paketi

1. Tasarım tokenlarını `tailwind.config.js` altında semantik renk isimlerine çekin.
2. Discover kartlarını tek tip bileşene taşıyın (avatar/görsel, online badge, ortak ilgi barı).
3. Admin KPI özet satırını üst bölüme 4 kart halinde ekleyin.
4. Dark mode için temel paleti ve body/background geçişini ekleyin.
5. Boş durumlar için 2-3 reusable state bileşeni oluşturun.

---

## Referans alınan mevcut alanlar

- Çoklu ekran state’i: `mode`, `userView`, `adminTab`.
- Discover & spotlight: `discoverProfiles`, `spotlightProfiles`.
- Admin metrikleri: `adminStats`, `slaStats`, `engagementInsights`.
- Görsel temel: `src/styles.css` içindeki scrollbar, chat bubble tail ve `fadeIn` animasyonu.

