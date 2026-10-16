# 4. Görseller

| Panel alanı | Dosya | Boyut |
|---|---|---|
| Store icon | `store-icon-128.png` | 128×128 (çizim 96×96, 16 px şeffaf kenar) |
| Screenshot 1 | `screenshot-1-secim-butonu.png` | 1280×800 — IP seçilince çıkan buton |
| Screenshot 2 | `screenshot-2-sonuc-karti.png` | 1280×800 — yüksek skorlu sonuç kartı |
| Screenshot 3 | `screenshot-3-ozel-ip.png` | 1280×800 — özel IP, dışarı gönderilmedi |
| Screenshot 4 | `screenshot-4-anahtarsiz.png` | 1280×800 — API anahtarı yokken |
| Screenshot 5 | `screenshot-5-popup.png` | 1280×800 — araç çubuğu penceresi |
| Small promo tile | `small-promo-440x280.png` | 440×280 |
| Marquee promo tile | `marquee-1400x560.png` | 1400×560 (isteğe bağlı) |

Ekran görüntüleri bu sırayla yüklenmeli; mağazada ilk görsel öne çıkar.

## Tanıtım videosu (YouTube)

Dosya: `tanitim-videosu-1080p.mp4` (31 sn, 1920×1080, 30 fps, H.264, sessiz; anlatım ekrandaki alt yazılarla). Eklentinin gerçek koduyla, örnek veri içeren bir SIEM sayfasında kaydedildi. Dosya git'e eklenmez.

Akış:
1. Açılış: logo ve tek cümlelik tanıtım
2. Log ekranında IP seçme → “IP'yi sorgula” butonu
3. Sonuç kartı: skor, rapor sayısı, ülke, ISP
4. Kartın dışına tıklayınca kapanma
5. Özel IP: “AbuseIPDB'ye gönderilmedi”
6. Popup'ta API anahtarı girme
7. Kapanış: Chrome ve Firefox, gizlilik notu, “AbuseIPDB'nin resmi ürünü değildir”

Mağazaya eklemek için:
1. Videoyu YouTube'a yükle. Görünürlük: **Liste dışı** (Unlisted) yeterli.
2. YouTube bağlantısını panelde **Global promo video** alanına yapıştır.

Mağaza yalnızca YouTube bağlantısı kabul eder; MP4 doğrudan yüklenmez.
