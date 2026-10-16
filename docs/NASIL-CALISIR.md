# IP Critical Scorer – Nasıl çalışır?

Bu belge eklentinin her parçasının ne yaptığını ve nasıl çalıştığını anlatır: kullanıcı akışları, ekranlar, veri saklama, gizlilik, iç mimari, sınırlar, test ve yayın süreci. Kısa kurulum ve kullanım için depo kökündeki `README.md` yeterlidir; bu belge “neden ve nasıl” sorularının cevabıdır.

Belge 0.6.0 sürümünü anlatır.

---

## İçindekiler

1. [Genel bakış](#1-genel-bakış)
2. [Temel akış: bir IP'yi sorgulamak](#2-temel-akış-bir-ipyi-sorgulamak)
3. [IP tanıma ve doğrulama](#3-ip-tanıma-ve-doğrulama)
4. [AbuseIPDB sorgusu, önbellek ve istek sınırı](#4-abuseipdb-sorgusu-önbellek-ve-istek-sınırı)
5. [Sonuç kartı](#5-sonuç-kartı)
6. [Toplu sorgu](#6-toplu-sorgu)
7. [Excel'e kopyalama ve şablon](#7-excele-kopyalama-ve-şablon)
8. [Notlar ve hazır notlar](#8-notlar-ve-hazır-notlar)
9. [Sorgu geçmişi](#9-sorgu-geçmişi)
10. [Sayfada bilinen IP'leri işaretleme](#10-sayfada-bilinen-ipleri-işaretleme)
11. [Kalan günlük hak](#11-kalan-günlük-hak)
12. [Klavye kısayolları](#12-klavye-kısayolları)
13. [Araç çubuğu penceresi (popup)](#13-araç-çubuğu-penceresi-popup)
14. [Ayarlar sayfası](#14-ayarlar-sayfası)
15. [Site izinleri ve iframe'ler](#15-site-izinleri-ve-iframeler)
16. [Veri saklama ve gizlilik](#16-veri-saklama-ve-gizlilik)
17. [Güvenlik önlemleri](#17-güvenlik-önlemleri)
18. [İç mimari](#18-iç-mimari)
19. [Chrome ve Firefox farkları](#19-chrome-ve-firefox-farkları)
20. [Sınırlar ve sabit değerler](#20-sınırlar-ve-sabit-değerler)
21. [Geliştirme, test ve paketleme](#21-geliştirme-test-ve-paketleme)
22. [Mağaza ve dağıtım](#22-mağaza-ve-dağıtım)
23. [Bilinen kısıtlar ve doğrulanmamış noktalar](#23-bilinen-kısıtlar-ve-doğrulanmamış-noktalar)

---

## 1. Genel bakış

IP Critical Scorer, SOC analistinin log, SIEM ve ticket ekranlarında gördüğü bir IP adresinin AbuseIPDB itibarına **sekme değiştirmeden** bakmasını sağlayan bir tarayıcı eklentisidir.

Temel ilkeler:

- **Seçim tek başına istek göndermez.** Ağ isteği yalnızca kullanıcı butona ya da kısayola bastığında yapılır.
- **Yalnızca IP gönderilir.** Sayfanın adresi, içeriği, çerezler ya da log metni hiçbir yere gitmez.
- **Özel adresler dışarı çıkmaz.** `10.x`, `192.168.x`, `127.x`, `fe80::` gibi adresler yerelde açıklanır.
- **Veri kaynağı resmi API'dir.** AbuseIPDB'nin herkese açık sayfası okunmaz (Cloudflare koruması ve kullanım şartları nedeniyle); kullanıcının kendi API anahtarıyla resmi APIv2 kullanılır.
- **Her şey tarayıcıda kalır.** Ayarlar, geçmiş ve notlar yalnızca kullanıcının tarayıcısında tutulur; geliştiriciye hiçbir veri gitmez.
- **Otomasyon önceliklidir.** Özellikler analistin iş yükünü azaltacak şekilde tasarlanır: tek tık, toplu işlem, klavye ile akış.

---

## 2. Temel akış: bir IP'yi sorgulamak

```
Kullanıcı IP seçer
      │
      ▼
İçerik betiği seçimi okur ─── IP yok ──► hiçbir şey olmaz
      │ IP var
      ▼
“IP’yi sorgula” butonu seçimin yanında çıkar   (henüz ağ isteği yok)
      │ kullanıcı tıklar ya da Alt+Shift+A
      ▼
Kart açılır, “Sorgulanıyor…”
      │ mesaj: { type: "lookup", ip }
      ▼
Arka plan betiği
  ├─ özel adres mi? ─────────────► “yerel” cevabı (istek yok)
  ├─ API anahtarı yok mu? ───────► “anahtar yok” cevabı (istek yok)
  ├─ önbellekte var mı? ─────────► önbellekten cevap (istek yok)
  ├─ istek sınırı beklemesi var mı? ► “sınır” cevabı (istek yok)
  └─ AbuseIPDB APIv2 /check isteği
      │
      ▼
Sonuç karta yazılır, geçmişe kaydedilir, kalan hak güncellenir
```

1. **Seçim:** Kullanıcı fareyle (çift tıklama ya da sürükleme), klavyeyle ya da bir metin kutusunun içinde metin seçer. İçerik betiği `mouseup` ve `keyup` olaylarında seçimi okur.
2. **Buton:** Seçimde geçerli bir IP varsa seçimin hemen altında küçük bir buton çıkar. Birden fazla IP varsa buton “N IP’yi sorgula” olur (bkz. [Toplu sorgu](#6-toplu-sorgu)). Başka bir yere tıklamak, sayfayı kaydırmak ya da `Esc` butonu gizler.
3. **Sorgu:** Butona basılınca kart açılır ve arka plan betiğine yalnızca IP gönderilir.
4. **Sonuç:** Kart sonucu gösterir. Sonuç başarılıysa geçmişe yazılır ve kalan günlük hak güncellenir.

---

## 3. IP tanıma ve doğrulama

Kod: `src/shared/ip.js` (`globalThis.IpTools`).

### Seçimi temizleme

Seçilen metin önce temizlenir; SOC'ta sık görülen yazımlar tanınır:

| Seçim | Sonuç |
|---|---|
| `8.8.8.8` | `8.8.8.8` |
| ` 8.8.8.8, ` / `(8.8.8.8)` / `"8.8.8.8"` | `8.8.8.8` |
| `8.8.8[.]8` (defang) | `8.8.8.8` |
| `8.8.8.8:443` | `8.8.8.8` |
| `[2001:4860:4860::8888]:443` | `2001:4860:4860::8888` |
| `src=8.8.8.8` | metin içindeki tek IP olarak bulunur |

### Doğrulama

- **IPv4:** Dört parça, her biri 0–255. Başında sıfır olan parçalar (`01.2.3.4`) reddedilir, çünkü bazı araçlar bunları sekizlik sayı olarak yorumlar.
- **IPv6:** `::` kısaltması, sonda gömülü IPv4 (`::ffff:1.2.3.4`) desteklenir. Bölge belirteci (`%eth0`) reddedilir. Adres RFC 5952'ye göre standart biçime çevrilir (`2001:4860:4860:0:0:0:0:8888` → `2001:4860:4860::8888`); böylece aynı adresin farklı yazımları tek kayıt olur.

### Özel amaçlı adres sınıflandırması

Aşağıdaki aralıklar **AbuseIPDB'ye gönderilmez**; kart adresin türünü yerelde açıklar:

| IPv4 | IPv6 |
|---|---|
| `0.0.0.0/8` bu ağ | `::` belirtilmemiş |
| `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` özel ağ | `::1` loopback |
| `100.64.0.0/10` CGNAT | `::ffff:0:0/96` IPv4 eşlemeli |
| `127.0.0.0/8` loopback | `64:ff9b::/96`, `64:ff9b:1::/48` NAT64 |
| `169.254.0.0/16` link-local | `100::/64` discard |
| `192.0.0.0/24` IETF | `2001::/23` IETF |
| `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` dokümantasyon | `2001:db8::/32`, `3fff::/20` dokümantasyon |
| `192.88.99.0/24` 6to4 relay | `2002::/16` 6to4 |
| `198.18.0.0/15` performans testi | `fc00::/7` ULA |
| `224.0.0.0/4` multicast | `fe80::/10` link-local |
| `240.0.0.0/4` ayrılmış, `255.255.255.255` yayın | `fec0::/10` site-local, `ff00::/8` multicast |
| | `2000::/3` dışındaki her şey (ayrılmış) |

### Metindeki tüm IP'leri bulma

`findIpTokens` bir metindeki bütün IP adaylarını (IPv4, defanglı IPv4, IPv6) konumlarıyla bulur. Her aday ayrıca doğrulanır; böylece saat (`09:41:07`), MAC adresi (`aa:bb:cc:dd:ee:ff`) ya da sürüm numarası (`1.2.3.4.5`) IP sanılmaz. `extractIps` bunların içinden en fazla 50 farklı IP'yi görünme sırasıyla döndürür.

---

## 4. AbuseIPDB sorgusu, önbellek ve istek sınırı

Kod: `src/background/lookup-service.js`, `src/shared/abuseipdb.js`.

### İstek

```
GET https://api.abuseipdb.com/api/v2/check?ipAddress=<ip>&maxAgeInDays=<1–365>
Key: <kullanıcının API anahtarı>
Accept: application/json
```

- Çerez gönderilmez (`credentials: "omit"`), yönlendirme izlenmez, referrer gönderilmez.
- 10 saniyede cevap gelmezse istek iptal edilir (“zaman aşımı”).
- `verbose` bayrağı kullanılmaz: bu bayrak 10.000'e kadar rapor döndürüp yanıtı gereksiz büyütür. Ülke adı, ülke kodundan tarayıcının kendi dil verisiyle üretilir.

### Yanıtın işlenmesi

Yanıttaki her alan tek tek doğrulanır. Beklenen türde olmayan ya da eksik bir değer **sıfıra çevrilmez**, `null` olur ve kartta “Bilinmiyor” diye gösterilir. Yanıttaki IP, sorgulanan IP ile aynı değilse yanıt reddedilir.

Kullanılan alanlar: `abuseConfidenceScore`, `totalReports`, `numDistinctUsers`, `lastReportedAt`, `countryCode`, `isp`, `usageType`, `domain`, `hostnames` (en fazla 5), `isTor`, `isWhitelisted`.

### Rapor dönemi

`maxAgeInDays` ayarı (varsayılan 365, en fazla 365) rapor sayısının ve son rapor tarihinin hangi dönemi kapsadığını belirler. AbuseIPDB API'si 365 günden eskisini vermez; daha eski raporlar için kartta AbuseIPDB sayfası bağlantısı vardır.

### Önbellek

- Başarılı sonuçlar `storage.session` içinde IP başına tutulur (varsayılan 15 dakika, 1–1440 dakika arası ayarlanabilir).
- `storage.session` tarayıcı kapanınca silinir, ama arka plan betiği yeniden başladığında korunur.
- Önbellek kaydı rapor dönemine bağlıdır: dönem değişirse eski kayıt kullanılmaz.
- Karttaki **Yenile** önbelleği atlar; ama aynı IP için 10 saniyeden kısa aralıkla yeni istek atılmaz.
- Önbellekten gelen sonuç hak harcamaz; kartta “önbellekten” yazar.

### Aynı anda gelen istekler

Aynı IP için aynı anda birden fazla sorgu gelirse (ör. iki sekmeden) tek bir istek atılır, hepsi aynı cevabı alır.

### Hata durumları

| Durum | Kartta | Ne olur |
|---|---|---|
| 401 | “API anahtarı geçersiz ya da yetkisiz” | “API anahtarını düzenle” butonu |
| 403 | “AbuseIPDB isteği reddetti” | AbuseIPDB'de aç bağlantısı |
| 422 | “isteği geçersiz buldu” | Tekrar dene |
| 429 | “istek sınırına ulaşıldı”, ne zaman tekrar denenebileceği | Belirtilen süre boyunca hiç istek atılmaz |
| 5xx | “geçici bir sunucu hatası” | Tekrar dene |
| Ağ hatası / zaman aşımı | ilgili mesaj | Tekrar dene |
| Bozuk yanıt | “yanıt beklenen biçimde değil” | AbuseIPDB'de aç |
| Eklenti yeniden yüklendi | “sayfayı yenileyin” | Yalnızca bağlantı |

**429 beklemesi:** Süre `Retry-After` başlığından, yoksa `X-RateLimit-Reset` başlığından, o da yoksa 60 saniye olarak alınır; en fazla 24 saat. Bu süre `storage.session`'a yazılır, böylece arka plan betiği yeniden başlasa da bekleme korunur. Hatalı sonuçlar önbelleğe yazılmaz.

---

## 5. Sonuç kartı

Kod: `src/content/content-script.js`, stiller `src/content/card-styles.js`.

### Yapı

- **Başlık:** “ABUSEIPDB” etiketi, IP adresi, IP'yi tek tıkla kopyalayan küçük simge, kapatma (×).
- **Skor bloğu:** Büyük skor, “/ 100”, risk etiketi ve dolum çubuğu. Kartın üst kenarı riske göre renklenir:

  | Skor | Etiket | Renk |
  |---|---|---|
  | 0 | Skor 0 | gri |
  | 1–24 | Düşük | yeşil |
  | 25–74 | Orta | turuncu |
  | 75–100 | Yüksek | kırmızı |

- **Uyarı:** Skor 0 ise “0 skor, IP'nin güvenli olduğunu kanıtlamaz” notu çıkar.
- **Etiketler:** “Beyaz listede”, “Tor çıkış düğümü” (varsa).
- **Ayrıntılar:** Rapor sayısı ve kaynak sayısı, son rapor, ülke, ISP, kullanım türü, alan adı, hostname. Eksik değerler soluk “Bilinmiyor”.
- **Not alanı:** Hazır not düğmeleri ve serbest not alanı (bkz. [Notlar](#8-notlar-ve-hazır-notlar)).
- **Kısayol satırı, kalan hak satırı, kaynak satırı:** “AbuseIPDB APIv2 · zaman · önbellekten”.
- **Butonlar:** AbuseIPDB'de aç, Excel'e kopyala, ↻ Yenile.

Diğer durumlarda kart renkli kenarlı bir bilgi kutusu gösterir: özel IP (mavi), anahtar yok (mavi), hata (kırmızı).

### Davranış

- Kart sayfanın stillerinden etkilenmemesi için **kapalı Shadow DOM** içinde çizilir.
- Kart ekran dışına taşmaz; gerekirse seçimin üstüne yerleşir.
- Kapatma: kartın dışına tıklamak, `Esc` ya da ×.
- Kart içindeki tuş vuruşları sayfanın kendi kısayollarına ulaşmaz (ör. SIEM'in “/” arama kısayolu tetiklenmez).
- Sayfadan gelen hiçbir veri HTML olarak yorumlanmaz; her şey `textContent` ile yazılır.
- Açık ve koyu tema desteklenir; hareket azaltma ayarı açıksa animasyonlar kapanır.

---

## 6. Toplu sorgu

Birden fazla IP içeren bir metin seçildiğinde (log satırı, tablo satırları) buton **“N IP’yi sorgula”** olur.

1. **Liste:** Seçimdeki farklı IP'ler görünme sırasıyla alınır (en fazla 50; fazlası varsa kart bunu belirtir).
2. **Özel adresler:** Listede “Özel ağ adresi (RFC 1918)” gibi açıklamayla görünür, sorgulanmaz.
3. **Onay:** Genel IP sayısı 10 ya da daha azsa sorgu hemen başlar. 10'dan fazlaysa kart, kaç sorgu yapılacağını ve bunların günlük haktan düşeceğini yazıp **Sorgulamayı başlat** butonuyla onay ister. Önbellekteki IP'ler hak harcamaz.
4. **Sorgu:** Aynı anda en fazla 2 sorgu çalışır; her satır “bekliyor → sorgulanıyor → sonuç” olarak güncellenir. Sonuç satırında renkli skor çipi, ülke kodu ve ISP görünür.
5. **Durma:** API anahtarı yoksa, anahtar geçersizse, istek reddedilirse ya da günlük hak biterse kalan IP'ler “atlandı” olarak işaretlenir ve sorgu durur.
6. **Kopyalama:** Bitince not alanı ve **Hepsini Excel'e kopyala (N)** çıkar. Her başarılı IP için bir satır, aynı notla kopyalanır. Kartın üst kenarı en yüksek skora göre renklenir.

IP adreslerine tıklamak AbuseIPDB sayfasını yeni sekmede açar.

---

## 7. Excel'e kopyalama ve şablon

Kod: `src/shared/export.js` (`globalThis.ExportTools`), düzenleyici `src/options/export-editor.js`.

### Nasıl kopyalanır?

Karttaki **Excel'e kopyala** sonucu **sekme (Tab) ile ayrılmış tek satır** olarak panoya koyar. Excel'de satırın ilk hücresine yapıştırınca her değer kendi sütununa düşer. Toplu kopyalamada her sonuç ayrı satırdır.

Pano yazımı:
- **https sayfalarda:** Tarayıcının pano API'si.
- **http sayfalarda** (iç ağ araçlarında sık görülür): Pano API'si kullanılamadığı için kartın içindeki gizli bir metin alanından kopyalanır.

### Şablon

Ayarlar → **Excel kopyalama şablonu**. Şablon bir sütun listesidir; her sütun ya bir **alan** ya da **özel sütun**dur.

Kullanılabilen alanlar:

| Alan | Varsayılan başlık | Örnek |
|---|---|---|
| Sorgu zamanı | Sorgu zamanı | `16.10.2026 09:41` |
| IP | IP | `203.0.113.45` |
| IP (defang) | IP (defang) | `203[.]0[.]113[.]45` |
| Abuse skoru | Abuse skoru | `92` |
| Risk | Risk | `Yüksek` |
| Rapor sayısı | Rapor sayısı | `214` |
| Kaynak sayısı | Kaynak sayısı | `61` |
| Son rapor | Son rapor | `16.10.2026 08:12` |
| Ülke / Ülke kodu | Ülke / Ülke kodu | `Hollanda` / `NL` |
| ISP | ISP | `Example Hosting B.V.` |
| Kullanım türü | Kullanım türü | `Data Center/Web Hosting/Transit` |
| Alan adı | Alan adı | `example-hosting.test` |
| Hostname | Hostname | virgülle ayrılmış liste |
| Tor / Beyaz liste | Tor / Beyaz liste | `Evet` / `Hayır` |
| Rapor dönemi | Rapor dönemi (gün) | `365` |
| AbuseIPDB bağlantısı | AbuseIPDB bağlantısı | tam adres |
| Not | Not | `Bloklandı` |

- **Özel sütun:** Kendi tablonuzdaki “Analist”, “Ticket No” gibi sütunlar için. Sabit bir değer (ör. adınız) yazılabilir ya da boş bırakılıp yer tutulabilir.
- **Düzenleme:** Ekleme, kaldırma, ↑ ↓ ile sıralama, başlığı yeniden adlandırma. En fazla 30 sütun.
- **Boş değerler:** Boş hücre, “Bilinmiyor” ya da “-”.
- **Ayırıcı:** Sekme (Excel'e yapıştırmak için) ya da noktalı virgül (CSV için).
- **Önizleme:** Örnek veriyle canlı tablo.
- **Başlık satırını kopyala:** Yeni bir Excel'e başlıkları tek seferde yapıştırmak için.
- **Varsayılan şablon:** Sorgu zamanı, IP, skor, risk, rapor sayısı, kaynak sayısı, son rapor, ülke, ISP, kullanım türü, alan adı, AbuseIPDB bağlantısı, not.

### Biçim kuralları

- Tarihler `gg.aa.yyyy ss:dd` biçimindedir; Türkçe Excel bunu tarih olarak tanır.
- Sayılar (skor, rapor sayısı) sayı olarak yazılır.
- Değerlerin içindeki sekme ve satır sonları boşluğa çevrilir; bir değer satırı bölemez.
- `=`, `+`, `-` ya da `@` ile başlayan metinlerin başına `'` eklenir (bkz. [Güvenlik](#17-güvenlik-önlemleri)).
- Noktalı virgül ayırıcıda, içinde `;` ya da `"` geçen hücreler tırnak içine alınır.

---

## 8. Notlar ve hazır notlar

- Kartta hazır not düğmeleri ve serbest bir not alanı vardır. Bir düğmeye basmak alanı o notla doldurur; aynı düğmeye tekrar basmak temizler. Seçili düğme koyu görünür.
- Varsayılan hazır notlar: “False positive”, “Bloklandı”, “İzlemeye alındı”, “İncelendi, aksiyon yok”. Ayarlardaki Excel bölümünde her satıra bir not yazılarak değiştirilir (en fazla 10 not, her biri en fazla 60 karakter).
- Not, Excel satırında **Not** sütununa yazılır. Şablonda Not sütunu yoksa not kopyalanmaz; ayarlardan eklenmelidir.
- Not tek satırdır, en fazla 200 karakterdir; fazla boşluklar teke indirilir.
- Kopyalama başarılı olunca not ilgili IP'nin geçmiş kaydına da yazılır. Toplu kopyalamada aynı not tüm satırlara uygulanır.
- Geçmiş sayfasında notlar sonradan düzenlenebilir.

---

## 9. Sorgu geçmişi

Kod: `src/shared/history.js` (saf mantık), arka plan kaydı `service-worker.js`, sayfa `src/history/`.

### Ne kaydedilir?

- Sonucu başarıyla alınan **her sorgu**: tekli, toplu, kısayolla ya da önbellekten gelen.
- Kayıt: IP, sorgu zamanı, sonucun alındığı zaman, AbuseIPDB bağlantısı, sonuç verileri, not.
- **Kaydedilmeyenler:** Özel/yerel IP'ler, API anahtarı yokken yapılan denemeler, hata alan sorgular.

### Kurallar

- Her IP için **tek kayıt** tutulur. Aynı IP tekrar sorgulanırsa kayıt en üste taşınır ve sonuçlar güncellenir; varsa eski not korunur.
- Varsayılan saklama süresi **7 gün** (ayarlardan 1–90 gün). Süresi geçen kayıtlar her yazmada ve sayfa açılışında silinir.
- En fazla **500** kayıt tutulur.
- Kayıt ayarlardan tamamen kapatılabilir. Kapalıyken yeni sorgu kaydedilmez, mevcut kayıtlar silinene kadar durur.
- Toplu sorgu sırasında sonuçlar paralel geldiği için arka plan betiği geçmiş yazımlarını **sıraya koyar**; kayıtlar birbirini ezmez.

### Geçmiş sayfası

Araç çubuğu simgesi → **Sorgu geçmişi (N)** ya da Ayarlar → **Geçmişi aç**.

- **Filtre:** Bugün (varsayılan) / Tümü.
- **Arama:** IP, ISP, ülke kodu, alan adı ya da notta geçen metin.
- **Seçim:** Satır başındaki kutular ve başlıktaki “hepsini seç”.
- **Seçilenleri Excel'e kopyala / Görünenleri Excel'e kopyala:** Excel şablonuyla, her kayıt bir satır.
- **CSV indir:** Görünen kayıtlar, başlık satırıyla. Dosya UTF-8 BOM ve noktalı virgülle yazılır; Türkçe karakterler Excel'de doğru açılır.
- **Not:** Her satırdaki not alanı düzenlenebilir; alandan çıkınca kaydedilir.
- **Seçilenleri sil** ve **Geçmişi temizle** (yanlışlıkla silmeyi önlemek için ikinci tıklamada çalışır).

**Gün sonu kullanımı:** Geçmiş sayfası → filtre “Bugün” → **Görünenleri Excel'e kopyala** → Excel'e yapıştır.

---

## 10. Sayfada bilinen IP'leri işaretleme

Varsayılan olarak **kapalıdır**. Ayarlar → Sorgu geçmişi → “Daha önce sorgulanan IP'leri sayfalarda skor rengiyle işaretle”.

Açıkken:
- İzin verilen sitelerde sayfa metni, geçmişte bulunan IP'ler için **yalnızca tarayıcıda** taranır.
- Bulunan IP'lerin altı skor rengiyle çizilir ve hafifçe renklendirilir (kırmızı, turuncu, yeşil, gri).
- Yeni sorgu yapılmaz, hak harcanmaz, hiçbir şey gönderilmez.

Teknik ayrıntılar:
- İşaretleme **CSS Custom Highlight API** ile yapılır. Sayfanın HTML yapısına hiçbir öğe eklenmez; bu yüzden SIEM gibi karmaşık uygulamaların kendi kodu bozulmaz.
- Metin kutuları, betikler ve stil blokları taranmaz.
- Sayfa değiştikçe (yeni log satırları vb.) tarama tekrarlanır. Sürekli güncellenen sayfalarda bile en geç 0,8 saniyede bir tarama yapılır.
- Performans için en fazla 20.000 metin parçası ve 3.000 işaret.
- Bir sorgudan sonra ve sekmeye geri dönüldüğünde işaretler güncellenir.
- Bu API Chrome 105 ve üstünde var. Desteklemeyen tarayıcılarda (şu an Firefox) ayar kapalı ve açıklamalı görünür.

---

## 11. Kalan günlük hak

- AbuseIPDB her `check` yanıtında `X-RateLimit-Limit`, `X-RateLimit-Remaining` ve `X-RateLimit-Reset` başlıklarını gönderir. Eklenti her başarılı yanıttan sonra bu üç sayıyı `storage.local`'a yazar.
- Kartın altında ve araç çubuğu penceresinde gösterilir: “Kalan hak: 874 / 1.000”.
- Kalan hak limitin %10'unun altına düşünce turuncu olur.
- Sıfırlanma zamanı geçmişse “yenilendi (yeni sorguda güncellenir)” yazar.
- 429 yanıtı alınırsa kalan hak 0 olarak kaydedilir.
- Bu bilgi için **ek istek yapılmaz**; değer, son yapılan sorgu anındaki durumdur.
- Ücretsiz AbuseIPDB hesabının günlük `check` limiti 1.000'dir.

---

## 12. Klavye kısayolları

| Tuş | Nerede | İş |
|---|---|---|
| Alt+Shift+A (Mac: Option+Shift+A) | sayfada | Seçili IP'yi ya da IP'leri sorgula |
| C | kart açıkken | Excel'e kopyala (toplu kartta hepsini) |
| O | kart açıkken | AbuseIPDB'de aç |
| R | kart açıkken | Yenile |
| 1–9 | kart açıkken | Sıradaki hazır notu seç |
| N | kart açıkken | Not alanına geç |
| Enter | not alanında | Notla birlikte kopyala |
| Esc | her yerde | Kartı ve butonu kapat |

- Kart açıldığında odak karttadır, kısayollar hemen çalışır.
- Ctrl, Cmd ya da Alt basılıyken kart kısayolları çalışmaz; tarayıcı kısayolları etkilenmez.
- Alt+Shift+A tarayıcının kendi kısayol ayarından değiştirilebilir: `chrome://extensions/shortcuts`.

Fareye dokunmadan tam akış: IP'yi seç → Alt+Shift+A → 2 → C.

---

## 13. Araç çubuğu penceresi (popup)

Kod: `src/popup/`.

- **API anahtarı:** Durum (kayıtlı / yok), anahtar girişi (yazarken gösterme seçeneğiyle), kaydet, sil. Kayıtlı anahtar ekranda tekrar gösterilmez.
- **Kalan hak:** Son bilinen değer ve zamanı.
- **Bu site:** Açık sekmenin sitesi için eklentinin etkin olup olmadığı ve **Bu sitede etkinleştir** butonu.
- **Sürüm:** Kurulu sürüm.
- **Sorgu geçmişi (N)** ve **Tüm ayarlar** butonları.

---

## 14. Ayarlar sayfası

Kod: `src/options/`.

| Bölüm | İçerik |
|---|---|
| API anahtarı | Popup'takiyle aynı form |
| Rapor dönemi | 1–365 gün (varsayılan 365) |
| Excel kopyalama şablonu | Sütun düzenleyici, hazır notlar, boş değer, ayırıcı, önizleme, başlık kopyalama |
| Sorgu geçmişi | Kaydet aç/kapat, bilinen IP işaretleme, saklama süresi, geçmişi aç |
| Önbellek | 1–1440 dakika (varsayılan 15), önbelleği temizle |
| Site erişimi | İzin verilen siteler, site ekle, tüm sitelerde çalıştır, izni kaldır |
| Ayarları paylaş | Dışa aktar, içe aktar, dosyadaki sitelere izin ver |

### Ayarları paylaşma

- **Dışa aktar:** `ip-critical-scorer-ayarlar.json` dosyası iner. İçinde önbellek süresi, rapor dönemi, geçmiş ayarları, işaretleme ayarı, hazır notlar, Excel şablonu ve site listesi vardır. **API anahtarı ve sorgu geçmişi dosyaya girmez.**
- **İçe aktar:** Dosya en fazla 100 KB olabilir. Biçimi ve uygulama adı kontrol edilir; her ayar tek tek doğrulanır. Tanınmayan ya da geçersiz değerler (ör. `apiKey`, aralık dışı süreler, `<all_urls>`, `file://` siteleri) yok sayılır.
- **Siteler:** Site izinleri dosyadan otomatik verilmez; tarayıcı izin isteğinin kullanıcı tıklamasıyla yapılmasını şart koşar. İçe aktarmadan sonra **Dosyadaki N siteye izin ver** butonu çıkar.

---

## 15. Site izinleri ve iframe'ler

- Kurulumda eklenti **hiçbir sitede çalışmaz**. Kullanıcı popup'tan “Bu sitede etkinleştir” ya da ayarlardan site ekleyerek izin verir; izin sonrası açık sekme yenilenmelidir.
- İzin verilen siteler için içerik betiği `scripting.registerContentScripts` ile kaydedilir. İzin eklenip kaldırıldıkça kayıt otomatik güncellenir; tarayıcının kendi “site erişimi” menüsünden yapılan değişiklikler de algılanır.
- Site girişi örnekleri: `siem.example.com`, `https://*.example.com`, `http://10.0.0.5:8080` (port eşleşme kalıbında yok sayılır).
- İçerik betiği izinli sitelerin **çerçevelerinde (iframe)** de çalışır. Çerçeve başka bir alan adından geliyorsa o alan adına da ayrıca izin verilmelidir.
- Klavye kısayolu sekmedeki tüm çerçevelere gider; yalnızca seçimin bulunduğu çerçeve cevap verir.

---

## 16. Veri saklama ve gizlilik

| Veri | Nerede | Ne kadar | Dışarı gider mi? |
|---|---|---|---|
| API anahtarı | `storage.local` | silinene kadar | Yalnızca `api.abuseipdb.com`'a, sorgu yetkisi için |
| Ayarlar, şablon, hazır notlar | `storage.local` | silinene kadar | Hayır (dışa aktarılırsa kullanıcının dosyasına) |
| Sorgu sonuçları önbelleği | `storage.session` | 15 dk (ayarlanabilir), tarayıcı kapanınca silinir | Hayır |
| 429 bekleme zamanı | `storage.session` | tarayıcı kapanınca silinir | Hayır |
| Sorgu geçmişi ve notlar | `storage.local` | 7 gün (1–90), en fazla 500 kayıt | Hayır |
| Kalan hak (3 sayı) | `storage.local` | yeni sorguda güncellenir | Hayır |
| Seçilen IP | — | — | Butona basılınca `api.abuseipdb.com`'a |

- Sayfa adresi, sayfa içeriği, log metni, çerezler gönderilmez.
- İşaretleme açıksa sayfa metni yalnızca yerelde IP aramak için okunur; saklanmaz, gönderilmez.
- Telemetri, analiz ya da reklam yoktur; geliştiriciye hiçbir veri gitmez.
- Eklenti kaldırılınca tüm veriler tarayıcı tarafından silinir.
- Chromium'da `storage.local` web sayfalarına eklenen içerik betiğinin erişimine kapatılır (`setAccessLevel: TRUSTED_CONTEXTS`). İçerik betiği şablonu ve notları arka plan betiğinden mesajla ister.

Ayrıntılı metin: `PRIVACY.md`.

---

## 17. Güvenlik önlemleri

- **Sabit hedef:** Eklentinin bağlandığı tek uzak adres `https://api.abuseipdb.com/api/v2/check`. Keyfi adrese istek atan bir mesaj arayüzü yoktur.
- **Mesaj doğrulama:** Arka plan betiği yalnızca kendi eklentisinden gelen mesajları kabul eder. Mesaj türü, IP uzunluğu (≤100), IP listeleri (≤100 öğe, her biri doğrulanmış IP) ve not türü kontrol edilir.
- **Uzak kod yok:** Bütün JavaScript paketin içindedir; `eval` ve uzaktan betik yüklenmez.
- **Güvenilmeyen veri:** AbuseIPDB yanıtı ve sayfa metni yalnızca veri olarak işlenir; DOM'a `textContent` ile yazılır.
- **Excel formül enjeksiyonu:** `=`, `+`, `-` ya da `@` ile başlayan metin hücrelerinin başına `'` eklenir. Örneğin ISP adı `=HYPERLINK(...)` olsa bile Excel bunu formül olarak çalıştırmaz.
- **Shadow DOM:** Kart kapalı Shadow DOM içindedir; sayfanın betikleri kartın içine erişemez.
- **Sayfa kısayolları:** Kart içindeki tuş vuruşları sayfaya iletilmez.
- **İzinler en dar halde:** `storage`, `scripting`, `activeTab`, yalnızca `api.abuseipdb.com` sabit izni; site izinleri isteğe bağlı ve kullanıcı onaylı.

---

## 18. İç mimari

### Bileşenler

```
┌──────────────────────── Web sayfası (izinli site, çerçeveler dahil) ────────────────────────┐
│  content-script.js  (+ ip.js, export.js, card-styles.js)                                    │
│   • seçim → buton → kart (Shadow DOM)    • toplu sorgu    • not, kopyalama    • işaretleme  │
└───────────────────────────────┬─────────────────────────────────────────────────────────────┘
                                │ runtime.sendMessage
┌───────────────────────────────▼─────────────────────────────────────────────────────────────┐
│  service-worker.js  (Chromium: service worker · Firefox: event page)                        │
│   • mesaj doğrulama  • lookup-service.js (önbellek, birleştirme, 429, kalan hak)            │
│   • geçmiş yazımı (sıralı)  • içerik betiği kaydı  • kısayol komutu                         │
└───────────────┬───────────────────────────────────────────────┬─────────────────────────────┘
                │ fetch                                          │ storage.local / session
        api.abuseipdb.com                                 popup · options · history sayfaları
```

### Dosyalar (`chromium/src/`)

| Dosya | Görev |
|---|---|
| `background/service-worker.js` | Mesajlar, içerik betiği kaydı, geçmiş yazımı, kısayol |
| `background/lookup-service.js` | Sorgu akışı: doğrulama, önbellek, birleştirme, 429, kalan hak (test edilebilir, bağımlılıklar dışarıdan verilir) |
| `shared/ip.js` | IP temizleme, doğrulama, sınıflandırma, metinden IP bulma (klasik betik, `globalThis.IpTools`) |
| `shared/abuseipdb.js` | İstek oluşturma, yanıt normalleştirme, hata eşleme, kalan hak okuma |
| `shared/export.js` | Excel şablonu, satır üretimi, alan kataloğu (klasik betik, `globalThis.ExportTools`) |
| `shared/history.js` | Geçmiş ekleme, budama, not, silme (saf fonksiyonlar) |
| `shared/settings.js` | Ayar anahtarları, doğrulayıcılar, varsayılanlar, ayar dosyası, kalan hak metni |
| `shared/ext.js` | `browser ?? chrome` — iki tarayıcıda aynı API |
| `content/content-script.js` | Sayfadaki her şey: buton, kart, toplu sorgu, not, kısayol, işaretleme |
| `content/card-styles.js` | Kart stilleri (Shadow DOM içine) |
| `popup/` | Araç çubuğu penceresi |
| `options/` | Ayarlar sayfası ve Excel şablon düzenleyicisi |
| `history/` | Sorgu geçmişi sayfası |
| `ui/api-key-form.js` | Popup ve ayarlarda ortak anahtar formu |

`ip.js` ve `export.js` klasik betik olarak yazılmıştır, çünkü tarayıcı içerik betiklerinin ES modülü olmasına izin vermez. Aynı dosyalar arka plan betiğine ve testlere de yüklenir.

### Mesajlar (içerik betiği / sayfalar → arka plan)

| Mesaj | Gönderen | Cevap |
|---|---|---|
| `lookup { ip, refresh? }` | kart | Sonuç: `ok` / `local` / `no_key` / `invalid` / `error` (+ `quota`) |
| `getExportSettings` | kart | `{ template, quickNotes }` |
| `setHistoryNote { ips[], note }` | kart, geçmiş sayfası | `{ ok: true }` |
| `removeHistory { ips[] }` ya da `{ all: true }` | geçmiş sayfası | `{ ok: true }` |
| `getKnownIps` | içerik betiği | `{ enabled, scores: { ip: skor } }` |
| `openHistory`, `openOptions` | kart | — |
| `lookupSelection` (arka plan → sekme) | kısayol komutu | — |

### Depolama anahtarları

`storage.local`: `apiKey`, `cacheTtlMinutes`, `maxAgeInDays`, `exportTemplate`, `quickNotes`, `historyEnabled`, `historyDays`, `highlightKnown`, `history`, `quota`.
`storage.session`: `cache:<ip>`, `state:rateLimitedUntil`.

### Arka plan betiğinin yeniden başlaması

Chromium arka plan betiğini boştayken durdurur. Kalıcı her şey `storage` içinde olduğu için yeniden başlayınca kaybolan tek şey, o an süren aynı-IP istek birleştirmesidir. Önbellek, 429 beklemesi, geçmiş ve kalan hak korunur.

---

## 19. Chrome ve Firefox farkları

Proje iki pakettir:

| | `chromium/` | `firefox/` |
|---|---|---|
| Tarayıcılar | Chrome, Edge, Brave | Firefox 140+ |
| Arka plan | `service_worker` | `background.scripts` (event page, ES modülü) |
| Kimlik | mağaza verir | `ip-critical-scorer@zaferhamzak.github.io` |
| Veri beyanı | mağaza panelinde | manifest'te `data_collection_permissions`: `websiteContent`, `authenticationInfo` |
| `storage.setAccessLevel` | var | yok; anahtar içerik betiğinden gizlenemez (web sayfaları yine erişemez) |
| Sayfada işaretleme | Chrome 105+ | API yok, ayar kapalı |

Kod tek yerde yazılır: `chromium/src`. `npm run sync` bunu `firefox/src`'ye kopyalar; testler iki klasör farklılaşırsa hata verir. API çağrıları `shared/ext.js` üzerinden yapılır.

---

## 20. Sınırlar ve sabit değerler

| Değer | Sınır |
|---|---|
| Tekli seçim uzunluğu (tam eşleşme) | 100 karakter |
| Toplu seçim metni | 20.000 karakter |
| Toplu sorguda IP | en fazla 50 |
| Onaysız toplu sorgu | en fazla 10 genel IP |
| Toplu sorguda eşzamanlı istek | 2 |
| İstek zaman aşımı | 10 sn |
| Yenile en kısa aralık | 10 sn |
| Önbellek | 1–1440 dk (varsayılan 15) |
| Rapor dönemi | 1–365 gün (varsayılan 365) |
| 429 beklemesi | varsayılan 60 sn, en fazla 24 saat |
| Geçmiş | 1–90 gün (varsayılan 7), en fazla 500 kayıt |
| Not | 200 karakter |
| Hazır not | en fazla 10, her biri 60 karakter |
| Excel şablonu | en fazla 30 sütun, metinler 100 karakter |
| Hostname | en fazla 5 |
| İşaretleme taraması | 20.000 metin parçası, 3.000 işaret |
| Ayar dosyası | 100 KB, en fazla 50 site |

---

## 21. Geliştirme, test ve paketleme

Gereksinim: Node.js 20+. Proje ek bağımlılık kullanmaz.

```sh
npm test          # birim testleri (Node yerleşik test koşucusu)
npm run sync      # chromium/src ve ikonları firefox/'a kopyalar
npm run package   # senkronlar, testleri çalıştırır, iki mağaza ZIP'i üretir
```

### Testler (`tests/`)

| Dosya | Kapsam |
|---|---|
| `ip.test.js` | IPv4/IPv6 doğrulama, temizleme, özel aralıklar, sınır değerler, metinden IP bulma |
| `abuseipdb.test.js` | İstek oluşturma, yanıt normalleştirme, eksik alanlar, hata kodları, 429 süreleri, hostname |
| `lookup-service.test.js` | Önbellek, TTL, yenileme aralığı, yeniden başlatma, birleştirme, 429 beklemesi, hata eşleme, kalan hak |
| `export.test.js` | Şablon, sütun sırası, özel sütunlar, formül koruması, boş değerler, CSV tırnaklama, defang, hostname |
| `history.test.js` | Ekleme, tekilleştirme, not koruma, saklama süresi, üst sınır, silme |
| `settings.test.js` | Ayar doğrulayıcıları, varsayılanlar, notlar, kalan hak metni, ayar dosyası gidiş-dönüş ve kötü niyetli dosya |
| `browsers.test.js` | İki paketin kod ve manifest uyumu, doğrudan `chrome.*` kullanılmaması |

Testler sentetik veri kullanır; IP'ler dokümantasyon aralıklarındandır ve gerçek AbuseIPDB'ye istek atılmaz.

### Paketler

`npm run package` şunları üretir:
- `dist/ip-critical-scorer-chromium-<sürüm>.zip` → Chrome Web Store / Edge Add-ons. Ayrıca `chromium/web-store/2-paket/` altına da kopyalanır; eski sürümler silinmez.
- `dist/ip-critical-scorer-firefox-<sürüm>.zip` → addons.mozilla.org.

ZIP'lerde yalnızca `manifest.json`, `src/` ve PNG ikonlar bulunur; `manifest.json` arşivin kök klasöründedir.

### Elle yükleme

- **Chrome:** `chrome://extensions` → Geliştirici modu → Paketlenmemiş öğe yükle → `chromium/` klasörü (ya da açılmış paket klasörü).
- **Firefox:** `about:debugging#/runtime/this-firefox` → Geçici eklenti yükle → `firefox/manifest.json`.

---

## 22. Mağaza ve dağıtım

- **Chrome Web Store:** Başvurunun tüm alanları `chromium/web-store/` altındadır: hesap kurulumu, paket, açıklamalar, görseller (ikon, 5 ekran görüntüsü, tanıtım görselleri, tanıtım videosu, YouTube metinleri), gizlilik alanları, dağıtım ve inceleme notları. Önerilen görünürlük “Liste dışı”.
- **Firefox Add-ons:** Metinler `firefox/store-assets/listing.md`. Lisans seçimi bekliyor.
- **Kurumsal kurulum:** BT ekibi eklenti kimliğini `ExtensionInstallAllowlist` ya da `ExtensionInstallForcelist` (Chrome), `ExtensionSettings` (Firefox) politikalarıyla dağıtabilir. Güncellemeyi tarayıcı kendisi yapar; bilgisayara betik ya da arka plan görevi kurulmaz.
- **Sürüm çıkarma:** İki manifest'teki `version` birlikte artırılır → `npm run package` → ZIP'ler mağazalara yüklenir.

---

## 23. Bilinen kısıtlar ve doğrulanmamış noktalar

- **Gerçek API başlıkları:** `X-RateLimit-*` başlıklarının eklentinin isteğinde okunabildiği gerçek bir API anahtarıyla doğrulanmadı.
- **Firefox:** Paket Mozilla'nın doğrulama aracından hatasız geçiyor, ama gerçek Firefox'ta çalıştırılmadı. Sayfada işaretleme Firefox'ta yok.
- **Farklı alan adından gelen çerçeveler:** Yalnızca o alan adına ayrıca izin verilirse çalışır.
- **Geçmiş:** Tarayıcıya özeldir; başka bir bilgisayar ya da tarayıcı profiliyle paylaşılmaz. Ekip paylaşımı yalnızca ayarlar için vardır.
- **Pano:** http sayfalarındaki yedek kopyalama yöntemi eski bir tarayıcı özelliğine dayanır; bazı kurumsal tarayıcı politikaları engelleyebilir.
- **Özel IP'ler, anahtarsız ve hatalı sorgular** geçmişe yazılmaz.
- **AbuseIPDB verisi:** Skor ve raporlar AbuseIPDB'nin verisidir; eklenti yeni tehdit istihbaratı üretmez ve skoru yorumlamaz. Skor 0, IP'nin güvenli olduğu anlamına gelmez.
