# AbuseIPDB IP Lookup

Sayfada seçtiğiniz IP adresini AbuseIPDB'de sorgulayıp sonucu aynı sayfada küçük bir kartta gösteren Chrome eklentisi. SOC analistlerinin log, SIEM ve ticket ekranlarında sekme değiştirmeden IP itibarına bakması için yapıldı.

> Bu eklenti AbuseIPDB'nin resmi ürünü değildir ve AbuseIPDB ile bağlantısı yoktur. Veriler AbuseIPDB'nin herkese açık APIv2'sinden, sizin API anahtarınızla alınır.

## Ne yapar

- Bir IP adresini mouse ile seçtiğinizde yanında **IP'yi sorgula** butonu çıkar. Seçim tek başına hiçbir istek göndermez; sorgu yalnızca butona bastığınızda yapılır.
- Kartta şunlar gösterilir: abuse confidence skoru (0–100), rapor sayısı ve kaç farklı kaynaktan geldiği, son rapor tarihi, ülke, ISP, kullanım türü, alan adı, Tor ve beyaz liste bilgisi.
- IPv4 ve IPv6 desteklenir. `8.8.8[.]8`, `8.8.8.8:443`, `[2001:db8::1]:443` gibi yazımlar da tanınır.
- Özel ve yerel adresler (`10.x`, `192.168.x`, `127.x`, `fe80::`, CGNAT, dokümantasyon aralıkları vb.) dışarı gönderilmez; kartta adresin türü açıklanır.
- API anahtarı girilmemişse kart, AbuseIPDB'deki detay sayfasına bağlantı verir.

## Kurulum

Eklenti Chrome Web Store'da değil; GitHub'dan indirilip elle yüklenir.

1. [Releases sayfasından](https://github.com/zaferhamzak/Ip-Critical-Scorer-With-Abuseipdb/releases/latest) en son `abuseipdb-ip-lookup-<sürüm>.zip` dosyasını indirin.
2. ZIP'i kalıcı bir yere açın, örneğin `Belgeler/chrome-eklentileri/`. İçinden `abuseipdb-ip-lookup` klasörü çıkar.
   **Bu klasörü sonradan taşımayın ya da silmeyin.** Chrome eklentiyi bu klasörden çalıştırır.
3. Chrome'da adres çubuğuna `chrome://extensions` yazın.
4. Sağ üstteki **Geliştirici modu** anahtarını açın.
5. **Paketlenmemiş öğe yükle** butonuna basın ve 2. adımdaki `abuseipdb-ip-lookup` klasörünü seçin.
6. Araç çubuğundaki yapboz simgesinden eklentiyi sabitleyin, böylece **IP** simgesi her zaman görünür.
7. **Otomatik güncellemeyi açın** (macOS ve Linux, bir kez yapılır). Terminal'de şunu çalıştırın; yolu 2. adımdaki klasöre göre düzeltin:

   ```sh
   sh ~/Belgeler/chrome-eklentileri/abuseipdb-ip-lookup/updater/install-auto-update.sh
   ```

   Ayrıntılar aşağıdaki **Güncelleme** bölümünde.

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

## Güncelleme

### Otomatik (macOS ve Linux)

Kurulumun 7. adımındaki komutu bir kez çalıştırdıysanız güncellemeler kendiliğinden gelir:

1. Bilgisayarınızdaki küçük bir betik oturum açılışında ve 6 saatte bir GitHub'daki son sürüme bakar. macOS'ta bunu bir LaunchAgent, Linux'ta crontab çalıştırır.
2. Yeni sürüm varsa ZIP'i yalnızca bu deponun Releases bölümünden indirir, sürümünü doğrular ve eklenti klasörüne yazar.
3. Eklenti en geç 5 dakika içinde dosyalarının değiştiğini fark eder ve kendini yeniden yükler. Ayarlarınız ve API anahtarınız korunur.

Güncelleme sırasında açık olan sekmelerde kart "Eklenti yeniden yüklenmiş" diyebilir; o sayfayı yenilemeniz yeterli.

- Kayıtlar: macOS'ta `~/Library/Logs/ip-critical-scorer-update.log`, Linux'ta `~/.local/share/ip-critical-scorer/update.log`.
- Kaldırmak için: `sh <eklenti klasörü>/updater/uninstall-auto-update.sh`

Eklenti klasörünü taşırsanız kurulum komutunu yeni konumdan tekrar çalıştırın.

### Elle (Windows ve otomatik güncelleme kurmayanlar)

Yeni sürüm çıktığında araç çubuğundaki simgede kırmızı **NEW** rozeti görünür; popup'ta indirme bağlantısı vardır.

1. Yeni ZIP'i indirin.
2. Eski `abuseipdb-ip-lookup` klasörünün içeriğini yeni ZIP'ten çıkan dosyalarla **aynı konumda** değiştirin.
3. `chrome://extensions` sayfasında eklentinin kartındaki **↻** butonuna basın.

Klasör aynı yerde kalırsa API anahtarınız ve ayarlarınız korunur. Klasörün yeri değişirse Chrome onu yeni bir eklenti sayar; anahtarı ve site izinlerini yeniden girmeniz gerekir.

### Güvenlik notu

Otomatik güncelleme, bu GitHub deposunda yayınlanan her sürümü güvenilir kabul eder. Depo sahibinin GitHub hesabı iki adımlı doğrulama ile korunmalıdır. Kontrollü ortamlarda otomatik güncellemeyi kurmayıp sürümleri inceledikten sonra elle güncelleyebilirsiniz.

## Gizlilik

- Yalnızca seçilen ve doğrulanan IP adresi ile API anahtarınız `api.abuseipdb.com` adresine gönderilir.
- Sayfanın adresi, içeriği, log metni ya da çerezler hiçbir yere gönderilmez.
- Güncelleme kontrolü için eklenti günde iki kez `api.github.com` adresinden son sürüm bilgisini okur. Bu istekte sizinle ilgili hiçbir veri gönderilmez.
- Telemetri ya da analiz yoktur.
- API anahtarı Chrome'un yerel depolamasında tutulur. Eklentinin sayfalara eklenen kendi bileşeni bile anahtarı okuyamaz; anahtarı yalnızca arka plan servisi kullanır.

## İzinler ve gerekçeleri

| İzin | Neden gerekli |
|---|---|
| `storage` | Ayarları, API anahtarını ve önbelleği saklamak |
| `scripting` | Seçim butonunu yalnızca izin verilen sitelere eklemek |
| `activeTab` | Simgeye tıklandığında o sitenin etkin olup olmadığını göstermek |
| `alarms` | Güncelleme kontrollerini zamanlamak |
| `api.abuseipdb.com` | Sorgu isteğini göndermek |
| `api.github.com` | Yeni sürüm olup olmadığına bakmak |
| Site izinleri (isteğe bağlı) | Yalnızca sizin seçtiğiniz sitelerde çalışmak |

## Sorun giderme

- **Buton çıkmıyor:** Simgeye tıklayıp sitenin etkin olduğunu kontrol edin ve sayfayı yenileyin. IP bir iframe (sayfa içine gömülü başka sayfa) içindeyse eklenti şu an orada çalışmaz.
- **"Eklenti yeniden yüklenmiş" mesajı:** Eklentiyi güncellediyseniz ya da yeniden yüklediyseniz açık sayfayı yenileyin.
- **401 hatası:** API anahtarı yanlış ya da iptal edilmiş. Simgeden yeni anahtar girin.
- **Chrome "Geliştirici modu uzantılarını devre dışı bırak" uyarısı:** Elle yüklenen eklentiler için gösterilebilir; **İptal** diyerek eklentiyi açık tutabilirsiniz.

## Geliştirme

Gereksinim: Node.js 20 veya üstü. Ek bağımlılık yoktur.

```sh
npm test          # birim testleri
npm run package   # testleri çalıştırır, dist/ altına ZIP üretir
```

Klasör yapısı:

```
manifest.json
src/background/   service worker, sorgu servisi
src/content/      seçim butonu ve sonuç kartı
src/shared/       IP doğrulama, AbuseIPDB API adaptörü, ayarlar
src/popup/        araç çubuğu penceresi
src/options/      ayarlar sayfası
updater/          otomatik güncelleme betikleri (macOS/Linux)
icons/            PNG ikonlar (source/ altında SVG kaynakları)
tests/            birim testleri ve sentetik test verisi
```

Geliştirirken depoyu doğrudan **Paketlenmemiş öğe yükle** ile yükleyebilir, değişiklikten sonra eklentiyi ↻ ile yenileyebilirsiniz.

### Yeni sürüm yayınlama

1. `manifest.json` içindeki `version` değerini artırın.
2. `npm run package` çalıştırın.
3. GitHub'da `v<sürüm>` etiketiyle (ör. `v0.4.0`) yeni bir Release oluşturup `dist/` altındaki ZIP'i ekleyin. Etiket, `manifest.json` sürümüyle aynı olmalıdır; güncelleme betiği uyuşmayan paketi reddeder.
