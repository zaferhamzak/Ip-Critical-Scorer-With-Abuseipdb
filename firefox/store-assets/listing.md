# Firefox Add-ons (AMO) başvuru metinleri

addons.mozilla.org Developer Hub'daki alanlara kopyalanacak metinler. AMO'da geliştirici hesabı ücretsizdir.

## Yükleme

- Dosya: `npm run package` ile üretilen `dist/ip-critical-scorer-firefox-<sürüm>.zip`
- Dağıtım: **On this site** (AMO'da listelenir, Firefox otomatik günceller).
- Kaynak kodu sorusu: **No**. Kod derlenmiyor ya da küçültülmüyor, paket kaynak kodun kendisi.

## Listeleme

**Name:** IP Critical Scorer

**Summary (en fazla 250 karakter):**
Sayfada seçtiğiniz IP adresinin AbuseIPDB itibar skorunu aynı sayfada küçük bir kartta gösterir. SOC analistleri için: seçim tek başına istek göndermez, özel adresler dışarı gönderilmez.

**Description:** `chromium/web-store/3-magaza-listesi/aciklama-tr.txt` metninin aynısı kullanılabilir. Son satırdaki "resmi ürünü değildir" notunu koruyun.

**Categories:** Privacy & Security

**Support site:** https://github.com/zaferhamzak/Ip-Critical-Scorer-With-Abuseipdb/issues

**Privacy policy:** `PRIVACY.md` içeriği (AMO metni doğrudan alana yapıştırmayı ister).

**License:** AMO bir lisans seçmenizi ister. Henüz karar verilmedi.

**Screenshots:** `chromium/web-store/4-gorseller/` altındaki `screenshot-*.png` dosyaları (örnek veri).

## Veri toplama beyanı

Manifest'te tanımlı (`browser_specific_settings.gecko.data_collection_permissions`). Firefox bunu kurulumda kullanıcıya gösterir:

- `websiteContent`: kullanıcının seçtiği IP adresi, butona bastığında AbuseIPDB'ye gönderilir.
- `authenticationInfo`: kullanıcının AbuseIPDB API anahtarı, sorguyu yetkilendirmek için AbuseIPDB'ye gönderilir.

Geliştiriciye hiçbir veri gönderilmez.

## Notes to reviewer

```
How to test:
1. Open any https page that contains an IP address. Click the toolbar icon and press "Bu sitede etkinleştir" (enable on this site), grant the permission, then reload the page.
2. Select an IP address; an "IP’yi sorgula" (look up IP) button appears. Press it.
3. Without an API key the card links to the AbuseIPDB page. With a free AbuseIPDB API key (entered in the toolbar popup) the card shows the abuse confidence score and report details.
4. Selecting a private address such as 192.168.1.1 shows a local explanation and sends no request.

Network: the only remote endpoint is https://api.abuseipdb.com/api/v2/check, called from the background script when the user presses the button. No remote code, no telemetry.
```
