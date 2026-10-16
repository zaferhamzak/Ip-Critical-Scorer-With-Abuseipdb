# 2. Paket

Yüklenecek dosya: `ip-critical-scorer-chromium-<sürüm>.zip`

Üretmek için depo kökünde:

```sh
npm run package
```

Komut testleri çalıştırır ve ZIP'i hem `dist/` altına hem bu klasöre koyar. Önceki sürümlerin ZIP'leri silinmez; gereksiz olanları kendin silebilirsin. ZIP'ler git'e eklenmez.

Panelde: **Items → New item** (ilk yükleme) ya da eklentinin **Package** sekmesi → **Upload new package**.

Yeni sürümde `chromium/manifest.json` ve `firefox/manifest.json` içindeki `version` aynı şekilde artırılmalıdır; mağaza aynı sürüm numarasıyla ikinci yüklemeyi kabul etmez.
