# Claude için proje rehberi

Bu projede ortak ve bağlayıcı geliştirme rehberi aynı klasördeki `AGENTS.md` dosyasıdır. İşe başlamadan onu oku ve kapsam, mimari, gizlilik, doğrulama ve tamamlanma ölçütlerini uygula.

## Proje özeti
Chrome için Manifest V3 eklentisi: kullanıcı mouse ile IP seçer, “IP’yi sorgula” butonuna basar ve sonuç aynı sayfada küçük bir kartta gösterilir. Public sayfa okunmaz (Cloudflare engeli ve Kullanım Şartları; ayrıntı `AGENTS.md`). API anahtarı isteğe bağlıdır: yoksa kart detay bağlantısı gösterir, varsa resmi APIv2 kullanılır. Seçim otomatik sorgu başlatmaz.

## Mevcut durum
Aşama 1–4 uygulandı (ayrıntı `AGENTS.md`). Testler `npm test`, dağıtım paketi `npm run package` (dist/ altına ZIP). Dağıtım GitHub Releases ile.

## Uygulama disiplini
- Önce mevcut dosyaları incele, ardından `AGENTS.md` içindeki aşamalar üzerinden ilerle.
- Public sayfa erişimini, erişim koşullarını ve Chrome teknik ayrıntılarını uygulamadan önce güncel resmi belgelerden doğrula.
- Ortak talimatları bu dosyada çoğaltmak yerine `AGENTS.md` içinde güncel tut.
- Gerçek API anahtarını veya müşteri loglarını çıktılara yazma; testler için sentetik veri ve mock kullan.
- Gereksiz bağımlılık ve kapsam genişlemesinden kaçın. Yapılan değişikliği ve gerçekten çalıştırılan kontrolleri Türkçe raporla.
