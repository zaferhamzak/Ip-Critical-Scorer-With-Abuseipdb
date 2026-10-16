# AbuseIPDB Chrome Extension

## Amaç ve mevcut durum
SOC analistinin tarayıcıda mouse ile seçtiği IP adresini AbuseIPDB üzerinden sorgulayıp sonucu bulunduğu sayfada görmesini sağlayan Chrome eklentisi.
Aşama 1–4 uygulandı: sorgu, önbellek, kart, popup ve ayarlar, ikonlar, README ve `npm run package` ile ZIP paketleme. Dağıtım GitHub Releases üzerinden ZIP + “Paketlenmemiş öğe yükle” ile yapılır; Chrome Web Store kullanılmıyor. Paketlenmemiş eklenti kendi dosyalarını değiştiremez; otomatik güncellemeyi `updater/update.sh` (macOS LaunchAgent / Linux crontab) yapar: yalnızca sabit repodaki release ZIP'ini indirir, tag ile manifest sürümünü eşleştirir, manifest'i en son yazar. Eklenti 5 dakikada bir diskteki manifest sürümünü okuyup farklıysa `chrome.runtime.reload()` çağırır; 12 saatte bir GitHub API ile yeni sürüm kontrolü yapıp rozet gösterir. Tarayıcıda otomatik uçtan uca test yok; kurulu Chrome sürümü komut satırından eklenti yüklemeyi engelliyor.

## İlk sürüm kapsamı
- Kullanıcı geçerli bir IP seçtiğinde yanında “IP’yi sorgula” butonu göster.
- Yalnızca kullanıcının butona basmasıyla sorgula; seçim tek başına ağ isteği başlatmasın.
- Sonucu sayfadan ayrılmadan, kapatılabilir küçük bir kartta göster.
- Kart: IP, AbuseIPDB abuse confidence skoru, toplam rapor sayısı, ülke, ISP, kullanım türü, varsa son rapor tarihi ve AbuseIPDB detay bağlantısı.
- Eksik alanları açıkça belirt; sıfır skoru “güvenli olduğunun kanıtı” diye sunma.
- API anahtarı isteğe bağlıdır. Anahtar yoksa kart IP doğrulamasını ve AbuseIPDB detay bağlantısını gösterir; anahtar girilirse veriler resmi APIv2 `check` uç noktasından alınır. Ayarlarda anahtar, önbellek ve site erişimi tercihlerini yönet.
- Aynı IP için süreli önbellek kullan; önerilen başlangıç süresi 15 dakika. Önbellek zamanını kartta göster ve kullanıcıya yenileme sun.
- IPv4 ve IPv6 doğrulamasını destekle. Özel, loopback, link-local ve internette yönlendirilmeyen diğer özel amaçlı adresleri dışarı göndermeden yerel açıklama göster.
- İlk sürümde çoklu IP taraması, otomatik raporlama, VirusTotal, hesap sistemi kapsam dışıdır. Gerekli olduğu teknik incelemeyle ortaya çıkarsa küçük bir yerel backend eklenebilir. Sağ tık menüsü daha sonra eklenebilir.

## Teknik yaklaşım
- Chrome Manifest V3; background service worker, content script, options sayfası ve ayrılmış stil dosyaları.
- İlk sürüm için sade JavaScript, HTML ve CSS kullan; ihtiyaç oluşmadan framework veya derleme zinciri ekleme.
- Content script seçimi ve kartı yönetir; service worker doğrulama, sorgu ve önbelleği yönetir.
- **Veri kaynağı kararı (Aşama 1, 2026-10-16):** Public IP sayfası (`/check/<ip>`) tarayıcı dışı isteklere Cloudflare challenge ile 403 döndürüyor (`cf-mitigated: challenge`) ve AbuseIPDB Kullanım Şartları (3/15/2023, Bölüm 3) otomatik erişimi, scraping’i ve koruma önlemlerini aşmayı yasaklıyor. Bu nedenle HTML ayrıştırma ve yerel backend yapılmaz. Kullanıcının kendi anahtarıyla resmi APIv2 kullanılır: `GET https://api.abuseipdb.com/api/v2/check?ipAddress=<ip>&maxAgeInDays=<n>` ve `Key`, `Accept: application/json` başlıkları. `verbose` kullanılmaz (10.000'e kadar rapor döndürüp yanıtı büyütür); ülke adı `countryCode`'dan tarayıcıda `Intl.DisplayNames` ile üretilir. `maxAgeInDays` API sınırı 1–365 gündür ("tüm zamanlar" yok); varsayılan 365, ayarlardan değiştirilebilir. Önbellek kaydı farklı dönem için yeniden kullanılmaz.
- Kullanıcının tarayıcı çerezleriyle (ör. Cloudflare onayı) public sayfayı okumaya çalışma; bu koruma önlemini aşmak sayılır.
- Hata ve sınır durumunda (401/403/429/ağ hatası) kartta açıklama ve AbuseIPDB detay sayfasını açma seçeneği göster. API yanıtındaki eksik veya `null` alanı sıfır olarak uydurma. Veri kaynağını ve alınma zamanını belirt.
- İzin tasarımı: zorunlu izinler `storage` ve `scripting`. Site erişimi `optional_host_permissions` ile kullanıcının ayarlardan verdiği sitelerle sınırlıdır; content script bu izinlere göre `chrome.scripting.registerContentScripts` ile kaydedilir. `https://api.abuseipdb.com/*` izni yalnızca anahtar kaydedilirken istenir. Anahtar `storage.local` içinde, content script erişimine kapalı (`TRUSTED_CONTEXTS`) tutulur; önbellek `storage.session` içindedir.
- İzinleri gerekçelendir ve mümkün olduğunca dar tut; sayfa erişimi için kullanıcı tarafından verilen site izinlerini değerlendir.
- Kartın sayfa stillerinden etkilenmemesi için Shadow DOM kullan. Kart ekran sınırlarını aşmasın; Escape ve kapatma butonu ile kapanabilsin.
- Service worker yeniden başlatıldığında kalıcı durumun doğru yönetilmesini sağla.

## Gizlilik ve güvenlik
- API anahtarını loglama, kartta gösterme veya content script’e iletme; yalnızca service worker `api.abuseipdb.com` isteğinde kullanır.
- Yalnızca seçilen ve doğrulanan IP’yi gönder; sayfa URL’si, log metni, müşteri adı veya sayfa içeriği gönderme.
- Oturum çerezlerini veya kullanıcı kimlik bilgilerini toplama. API isteklerinde `credentials: "omit"` kullan.
- Gelen mesajlarda veri tipini, boyutunu, IP’yi ve göndereni doğrula. Keyfi URL’ye istek atan bir mesaj arayüzü oluşturma.
- API ve sayfa verisini güvenilmeyen girdi say; DOM’a textContent ile yaz. Uzak kod, eval ve inline script kullanma.
- Telemetri veya üçüncü taraf analiz ekleme.

## Hata ve istek sınırı yönetimi
- 401/403, 429, CAPTCHA, ağ hatası, zaman aşımı, sayfa yapısı değişikliği ve eksik alanlar için anlaşılır durumlar göster.
- Aynı IP için eşzamanlı istekleri birleştir; otomatik sınırsız tekrar yapma.
- Düşük istek sıklığı, önbellek ve 429 yanıtında bekleme uygula; erişim sınırlarını aşmak için IP/proxy döndürme kullanma.

## Geliştirme aşamaları
1. ✅ Veri kaynağı kararı, manifest, izin tasarımı ve ayarlar iskeleti.
2. ✅ IP doğrulama, özel adres sınıflandırması, service worker mesaj arayüzü, APIv2 adaptörü, önbellek ve hata yönetimi.
3. ✅ Seçim butonu, Shadow DOM sonuç kartı, klavye erişimi ve görsel durumlar.
4. ✅ Doğrulama ve Chrome’a unpacked yükleme talimatlarını içeren README.

## Tamamlanma ölçütleri
- Public IP seçimi → buton → doğru IP’ye ait kart akışı çalışır; yalnızca seçim isteğe yol açmaz.
- Private/özel IP ve bozuk seçim için dış ağ isteği oluşmaz.
- Doğrulama, özel adres sınıflandırması, önbellek, API yanıtı normalizasyonu ve hata durumları anlamlı birim testleriyle (`npm test`, Node yerleşik test koşucusu) kontrol edilir; sentetik JSON fixture ve mock yanıtlar kullanılır.
- Chrome’da manuel olarak yükleme, anahtarsız ve anahtarlı sorgu, hata durumunda detay bağlantısı, kart kapatma, ekran kenarı, farklı sayfa stilleri ve service worker yeniden başlatma kontrol edilir.
- Gerçek müşteri sistemine test isteği gönderme; yerel örnek sayfa ve mock yanıtları kullan.
- Yapılmamış kontrolleri yapılmış gibi raporlama; değişiklikleri, doğrulamayı ve kalan eksikleri kısa biçimde bildir.

## Çalışma kuralları
- Mevcut dosyaları inceleyerek ilerle; ilgisiz dosyaları değiştirme.
- Kullanıcıyla Türkçe iletişim kur. Kod adlarında tutarlı İngilizce kullan.
- Kapsam içindeki geri alınabilir işleri sürdür; önemli ürün belirsizliğinde kısa bir açıklama iste.
- Kullanıcı istemedikçe yayımlama, mağazaya yükleme veya üçüncü taraf hesaplarında işlem yapma.
