# Permission justifications

Panelde her iznin altındaki kutuya ilgili metni yapıştır.

## storage

```
Kullanıcının AbuseIPDB API anahtarını, önbellek süresi ve rapor dönemi ayarlarını ve kısa süreli sorgu önbelleğini tarayıcıda yerel olarak saklamak için kullanılır. Veriler hiçbir sunucuya gönderilmez.
```

## scripting

```
IP seçim butonunu ve sonuç kartını yalnızca kullanıcının izin verdiği sitelere eklemek için chrome.scripting.registerContentScripts kullanılır. Kullanıcı bir siteye izin verdiğinde veya izni kaldırdığında kayıt güncellenir.
```

## activeTab

```
Kullanıcı eklenti simgesine tıkladığında açık sekmenin adresini okuyarak o sitede eklentinin etkin olup olmadığını gösterir ve tek tıkla etkinleştirme imkânı verir. Adres hiçbir yere gönderilmez.
```

## Host permission: https://api.abuseipdb.com/*

```
Kullanıcı “IP’yi sorgula” butonuna bastığında seçilen IP adresini AbuseIPDB APIv2 check uç noktasına (https://api.abuseipdb.com/api/v2/check) göndermek ve sonucu almak için gereklidir. Eklentinin bağlandığı tek uzak adres budur.
```

## Optional host permissions: https://*/*, http://*/*

```
Varsayılan olarak hiçbir siteye erişim yoktur. Kullanıcı, IP adreslerini gördüğü siteleri (ör. SIEM, log ekranı) kendisi seçip izin verir; eklenti yalnızca bu sitelerde ve bu sitelerin çerçevelerinde seçim butonunu gösterir. Kullanıcının seçtiği metin yalnızca yerelde IP adresi olup olmadığı için kontrol edilir. Kullanıcı isteğe bağlı “bilinen IP'leri işaretle” ayarını açarsa sayfa metni yalnızca yerelde IP aramak için taranır. Sayfa içeriği hiçbir yere gönderilmez.
```
