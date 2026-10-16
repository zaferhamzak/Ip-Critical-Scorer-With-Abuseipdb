# Data usage

Son karar senin; aşağıdaki seçimler eklentinin gerçek davranışına göre önerildi.

## Hangi kullanıcı verileri toplanıyor?

| Kategori | İşaretle | Neden |
|---|---|---|
| Personally identifiable information | Hayır | |
| Health information | Hayır | |
| Financial and payment information | Hayır | |
| Authentication information | **Evet** | Kullanıcının girdiği AbuseIPDB API anahtarı, sorguyu yetkilendirmek için AbuseIPDB'ye gönderilir. |
| Personal communications | Hayır | |
| Location | Hayır | |
| Web history | Hayır | Ziyaret edilen sayfaların adresi okunmaz ya da saklanmaz. |
| User activity | Hayır | Tıklama ya da tuş vuruşu kaydedilmez. |
| Website content | **Evet** | Kullanıcının sayfada seçtiği IP adresi, butona bastığında AbuseIPDB'ye gönderilir. |

## Beyanlar (üçü de işaretlenir)

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

AbuseIPDB'ye gönderim, eklentinin tek amacının (IP itibarını göstermek) kendisidir ve kullanıcının açık eylemiyle (butona basma) yapılır.
