# Chrome Web Store başvuru metinleri

Developer Dashboard'daki alanlara kopyalanacak metinler. Alan adları panelde İngilizcedir.

## Package

- Yüklenecek dosya: `npm run package` ile üretilen `dist/ip-critical-scorer-<sürüm>.zip`

## Store listing

**Title:** IP Critical Scorer (manifest'ten otomatik gelir)

**Summary (manifest description, en fazla 132 karakter):**
Sayfada seçtiğiniz IP adresinin AbuseIPDB itibar skorunu aynı sayfada küçük bir kartta gösterir.

**Description:**

```
IP Critical Scorer, SOC analistlerinin log, SIEM ve ticket ekranlarında sekme değiştirmeden IP itibarına bakması için yapıldı.

Nasıl çalışır
• Sayfada bir IP adresini seçin; yanında “IP’yi sorgula” butonu çıkar.
• Butona basınca AbuseIPDB sonucu aynı sayfada küçük bir kartta görünür.
• Seçim tek başına hiçbir istek göndermez; sorgu yalnızca butona bastığınızda yapılır.

Kartta
• Abuse confidence skoru (0–100) ve risk seviyesi
• Son 1 yıldaki rapor sayısı ve kaç farklı kaynaktan geldiği
• Son rapor tarihi, ülke, ISP, kullanım türü, alan adı
• Tor ve beyaz liste bilgisi
• AbuseIPDB detay sayfasına bağlantı

Özellikler
• IPv4 ve IPv6; 8.8.8[.]8, 8.8.8.8:443 gibi yazımlar da tanınır
• Özel ve yerel adresler (10.x, 192.168.x, 127.x, fe80:: …) dışarı gönderilmez, kartta türü açıklanır
• Önbellek ve AbuseIPDB istek sınırına uyum
• Yalnızca izin verdiğiniz sitelerde çalışır
• Açık ve koyu tema, klavye kısayolu (Alt+Shift+A)

Gereksinim
Skor ve rapor bilgisi için ücretsiz bir AbuseIPDB hesabından alınan API anahtarı gerekir (günde 1.000 sorgu). Anahtar olmadan kart, AbuseIPDB detay sayfasına bağlantı verir.

Gizlilik
Yalnızca seçtiğiniz IP adresi ve API anahtarınız api.abuseipdb.com adresine gönderilir. Sayfa adresi, içeriği veya çerezler gönderilmez. Telemetri yoktur.

Bu eklenti AbuseIPDB’nin resmi ürünü değildir ve AbuseIPDB ile bağlantısı yoktur.
```

**Category:** Developer Tools ya da Productivity (panelde güvenlik kategorisi yoksa)

**Language:** Turkish

**Screenshots (1280×800):**
- `store-assets/screenshot-1-button.png` — IP seçilince çıkan buton
- `store-assets/screenshot-2-card.png` — sonuç kartı

Ekran görüntülerindeki IP ve sonuçlar örnek veridir (203.0.113.0/24 dokümantasyon aralığı).

**Store icon:** `icons/icon-128.png`

## Privacy practices

**Single purpose:**

```
Kullanıcının bir web sayfasında seçtiği IP adresinin AbuseIPDB itibar bilgisini, kullanıcı butona bastığında aynı sayfada gösterir.
```

**Permission justifications:**

| İzin | Gerekçe (panele yapıştırılacak) |
|---|---|
| `storage` | Kullanıcının AbuseIPDB API anahtarını, önbellek ve rapor dönemi ayarlarını ve kısa süreli sorgu önbelleğini tarayıcıda saklamak için. |
| `scripting` | IP seçim butonunu ve sonuç kartını yalnızca kullanıcının izin verdiği sitelere eklemek için (chrome.scripting.registerContentScripts). |
| `activeTab` | Kullanıcı eklenti simgesine tıkladığında açık sitenin etkin olup olmadığını gösterip tek tıkla etkinleştirmek için. |
| Host permission `https://api.abuseipdb.com/*` | Seçilen IP için AbuseIPDB APIv2 check uç noktasına sorgu göndermek için. |
| Optional host permissions `https://*/*`, `http://*/*` | Kullanıcının kendisinin seçtiği sitelerde (ör. SIEM, log ekranı) seçim butonunu göstermek için. Varsayılan olarak hiçbir siteye erişim yoktur; izin site bazında kullanıcı tarafından verilir. |

**Remote code:** No, I am not using remote code.

**Data usage** (panelde işaretlenecekler; son hali senin kararın):
- *Website content:* İşaretle. Kullanıcının seçtiği IP adresi, kullanıcı butona bastığında AbuseIPDB'ye gönderiliyor.
- *Authentication information:* İşaretle. Kullanıcının girdiği AbuseIPDB API anahtarı AbuseIPDB'ye gönderiliyor.
- Diğer kategoriler (kişisel bilgiler, sağlık, finans, konum, web geçmişi, kullanıcı etkinliği, iletişim): İşaretleme.
- Üç beyanın üçünü de onayla: veriler onaylı kullanım dışında satılmıyor/aktarılmıyor, tek amaç dışında kullanılmıyor, kredi değerliliği için kullanılmıyor.

**Privacy policy URL:**
https://github.com/zaferhamzak/Ip-Critical-Scorer-With-Abuseipdb/blob/main/PRIVACY.md

## Distribution

- **Visibility:** Unlisted (yalnızca bağlantıyı bilenler). Herkese açık da seçilebilir.
- **Regions:** All regions

## Test instructions (inceleme ekibi için, isteğe bağlı)

```
1. Open any https page that contains an IP address, click the extension icon and press "Bu sitede etkinleştir" (enable on this site), then reload the page.
2. Select an IP address on the page; a "IP’yi sorgula" button appears. Press it.
3. Without an API key the card shows a link to the AbuseIPDB page. With a free AbuseIPDB API key (entered in the extension popup) the card shows the abuse confidence score and report details.
4. Selecting a private address such as 192.168.1.1 shows a local explanation and sends no request.
```
