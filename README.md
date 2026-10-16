# IP Critical Scorer

Sayfada seçtiğiniz IP adresinin AbuseIPDB itibar skorunu aynı sayfada küçük bir kartta gösteren Chrome eklentisi. SOC analistlerinin log, SIEM ve ticket ekranlarında sekme değiştirmeden IP itibarına bakması için yapıldı.

> Bu eklenti AbuseIPDB'nin resmi ürünü değildir ve AbuseIPDB ile bağlantısı yoktur. Veriler AbuseIPDB'nin herkese açık APIv2'sinden, sizin API anahtarınızla alınır.

![Sonuç kartı](store-assets/screenshot-2-card.png)

## Ne yapar

- Bir IP adresini mouse ile seçtiğinizde yanında **IP'yi sorgula** butonu çıkar. Seçim tek başına hiçbir istek göndermez; sorgu yalnızca butona bastığınızda yapılır.
- Kartta şunlar gösterilir: abuse confidence skoru (0–100), rapor sayısı ve kaç farklı kaynaktan geldiği, son rapor tarihi, ülke, ISP, kullanım türü, alan adı, Tor ve beyaz liste bilgisi.
- IPv4 ve IPv6 desteklenir. `8.8.8[.]8`, `8.8.8.8:443`, `[2001:db8::1]:443` gibi yazımlar da tanınır.
- Özel ve yerel adresler (`10.x`, `192.168.x`, `127.x`, `fe80::`, CGNAT, dokümantasyon aralıkları vb.) dışarı gönderilmez; kartta adresin türü açıklanır.
- API anahtarı girilmemişse kart, AbuseIPDB'deki detay sayfasına bağlantı verir.

## Kurulum

Eklenti Chrome Web Store üzerinden dağıtılır ve Chrome tarafından otomatik güncellenir.

1. Chrome Web Store sayfasını açın (bağlantı mağaza onayından sonra eklenecek).
2. **Chrome'a ekle**'ye basın.
3. Araç çubuğundaki yapboz simgesinden eklentiyi sabitleyin, böylece **IP** simgesi her zaman görünür.

### Kurumsal ortam (BT ekibi için)

Şirket Chrome'u eklentileri politika ile sınırlıyorsa BT ekibi eklentinin kimliğini (ID) izin listesine ekler. ID, mağaza sayfasının adresinin sonundaki 32 karakterlik değerdir.

- **Yalnızca izin vermek:** `ExtensionInstallAllowlist` listesine `<eklenti-id>` eklenir.
- **Herkese zorunlu kurmak:** `ExtensionInstallForcelist` listesine `<eklenti-id>;https://clients2.google.com/service/update2/crx` eklenir.

Politikalar Intune, Group Policy, Jamf ya da Google Admin konsolundan dağıtılabilir. Kurulum ve güncelleme Chrome'un kendisi tarafından yapılır; bilgisayarda ek betik ya da arka plan görevi çalışmaz.

## İlk ayarlar

### 1. Sitede etkinleştirme

Eklenti, güvenlik gereği yalnızca izin verdiğiniz sitelerde çalışır.

- IP'leri gördüğünüz sayfayı (SIEM, log ekranı vb.) açın.
- Araç çubuğundaki **IP** simgesine tıklayın, **Bu sitede etkinleştir** butonuna basın ve izni onaylayın.
- **Sayfayı yenileyin.**

Birden fazla siteyi ya da tüm siteleri ayarlar sayfasından yönetebilirsiniz: simge → **Tüm ayarlar** → **Site erişimi**.

### 2. API anahtarı (isteğe bağlı, önerilir)

Skor ve rapor bilgisini kartta görmek için ücretsiz bir AbuseIPDB API anahtarı gerekir.

1. [abuseipdb.com](https://www.abuseipdb.com/) adresinde ücretsiz hesap açın.
2. Hesabınızda **Account → API** bölümünden bir anahtar oluşturun.
3. Araç çubuğundaki **IP** simgesine tıklayın, anahtarı yapıştırın ve **Kaydet**'e basın.

Anahtar yalnızca bu tarayıcıda saklanır, ekranda tekrar gösterilmez ve yalnızca `api.abuseipdb.com` adresine gönderilir.

## Kullanım

1. Etkinleştirdiğiniz bir sayfada bir IP adresini mouse ile seçin (çift tıklama ya da sürükleme).
2. Çıkan **IP'yi sorgula** butonuna basın.
3. Kartı kapatmak için kartın dışına tıklayın, **Esc**'ye basın ya da **×** butonunu kullanın.

Klavye kısayolu: IP seçiliyken **Alt+Shift+A** (Mac'te **Option+Shift+A**). Kısayolu `chrome://extensions/shortcuts` adresinden değiştirebilirsiniz.

Kartta:
- **Yenile** sonucu AbuseIPDB'den tekrar alır.
- **AbuseIPDB'de aç** IP'nin AbuseIPDB sayfasını yeni sekmede açar. Raporların ayrıntısı ve daha eski kayıtlar oradadır.

### Skoru doğru okumak

- Skor 0 olması IP'nin **güvenli olduğunu kanıtlamaz**; yalnızca AbuseIPDB'de güncel kötüye kullanım raporu bulunmadığını gösterir.
- Renkler: 0 gri, 1–24 yeşil, 25–74 turuncu, 75–100 kırmızı.
- Yanıtta olmayan bilgiler "Bilinmiyor" olarak gösterilir; hiçbir değer uydurulmaz.

## Ayarlar

| Ayar | Varsayılan | Açıklama |
|---|---|---|
| Rapor dönemi | 365 gün | Rapor sayısı ve son rapor tarihi bu dönemi kapsar. AbuseIPDB API en fazla 365 güne izin verir. |
| Önbellek süresi | 15 dakika | Aynı IP bu süre içinde tekrar sorgulanmaz. Önbellek tarayıcı kapanınca silinir. |
| Site erişimi | Hiçbiri | Eklentinin çalışacağı siteler. |

## Limitler

Ücretsiz AbuseIPDB hesabında **günde 1.000 sorgu** hakkı vardır. Eklenti bu hakkı korumak için:

- Aynı IP'yi önbellek süresi içinde tekrar sorgulamaz.
- Aynı anda yapılan aynı IP sorgularını tek isteğe indirir.
- Özel adresleri ve geçersiz seçimleri hiç göndermez.
- Limit dolduğunda (HTTP 429) AbuseIPDB'nin bildirdiği süre boyunca istek atmaz ve kartta ne zaman tekrar denenebileceğini gösterir.

## Gizlilik

Ayrıntılı metin: [PRIVACY.md](PRIVACY.md)

- Yalnızca seçilen ve doğrulanan IP adresi ile API anahtarınız `api.abuseipdb.com` adresine gönderilir.
- Sayfanın adresi, içeriği, log metni ya da çerezler hiçbir yere gönderilmez.
- Telemetri ya da analiz yoktur; geliştiriciye hiçbir veri gitmez.
- API anahtarı Chrome'un yerel depolamasında tutulur. Eklentinin sayfalara eklenen kendi bileşeni bile anahtarı okuyamaz; anahtarı yalnızca arka plan servisi kullanır.

## İzinler ve gerekçeleri

| İzin | Neden gerekli |
|---|---|
| `storage` | Ayarları, API anahtarını ve önbelleği saklamak |
| `scripting` | Seçim butonunu yalnızca izin verilen sitelere eklemek |
| `activeTab` | Simgeye tıklandığında o sitenin etkin olup olmadığını göstermek |
| `api.abuseipdb.com` | Sorgu isteğini göndermek |
| Site izinleri (isteğe bağlı) | Yalnızca sizin seçtiğiniz sitelerde çalışmak |

## Sorun giderme

- **Buton çıkmıyor:** Simgeye tıklayıp sitenin etkin olduğunu kontrol edin ve sayfayı yenileyin. IP bir iframe (sayfa içine gömülü başka sayfa) içindeyse eklenti şu an orada çalışmaz.
- **"Eklenti yeniden yüklenmiş" mesajı:** Eklenti güncellendiğinde açık sayfalarda görülebilir; sayfayı yenileyin.
- **401 hatası:** API anahtarı yanlış ya da iptal edilmiş. Simgeden yeni anahtar girin.

## Geliştirme

Gereksinim: Node.js 20 veya üstü. Ek bağımlılık yoktur.

```sh
npm test          # birim testleri
npm run package   # testleri çalıştırır, dist/ altına Web Store ZIP'i üretir
```

Geliştirirken: `chrome://extensions` → **Geliştirici modu** → **Paketlenmemiş öğe yükle** → depo klasörü. Değişiklikten sonra eklentiyi ↻ ile yenileyin.

Klasör yapısı:

```
manifest.json
src/background/   service worker, sorgu servisi
src/content/      seçim butonu ve sonuç kartı
src/shared/       IP doğrulama, AbuseIPDB API adaptörü, ayarlar
src/popup/        araç çubuğu penceresi
src/options/      ayarlar sayfası
icons/            PNG ikonlar (source/ altında SVG kaynakları)
store-assets/     mağaza ekran görüntüleri ve başvuru metinleri
tests/            birim testleri ve sentetik test verisi
```

### Yeni sürüm yayınlama

1. `manifest.json` içindeki `version` değerini artırın.
2. `npm run package` çalıştırın.
3. Chrome Web Store Developer Dashboard'da eklentiyi açıp **Package** sekmesinden yeni ZIP'i yükleyin ve incelemeye gönderin.
4. Onaydan sonra Chrome, kullanıcılardaki eklentiyi kendiliğinden günceller.
