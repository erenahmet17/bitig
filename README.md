# Ders Defteri

Farklı yapay zekâ sohbetlerinden çıkan soru-cevapları ders ve bölüm bazında tek yerde toplayan web uygulaması.

**Canlı adres:** https://ders-defteri-eren-2611.vercel.app
Chrome veya Edge'de açıp adres çubuğundaki yükle simgesiyle (ya da uygulamadaki "⤓ Yükle" butonuyla) bilgisayara kurulabilir.
`main` dalına gönderilen her değişiklik Vercel'de otomatik yayınlanır.

## Yerelde çalıştırma (geliştirme)

`baslat.bat` dosyasına çift tıkla. Ya da terminalde şunu çalıştır:

```
npm install   # sadece ilk sefer
npm run dev
```

Ardından tarayıcıda http://localhost:5173 adresini aç.

## Özellikler

- Ders > bölüm > alt bölüm şeklinde sınırsız iç içe yapı
- Soru-cevap kartları: başta sadece sorular görünür, tıklayınca cevap açılır
- Markdown, tablo, kod renklendirme ve LaTeX formül desteği (`$…$`, `$$…$$`, `\(…\)`, `\[…\]`)
- Ctrl+Enter ile hızlı kaydetme; form açık kalır, art arda yapıştırabilirsin
- Açık / koyu tema
- JSON olarak yedek indirme ve yükleme

## Veriler nerede?

Notlar, kullandığın tarayıcının içinde (IndexedDB) saklanır. Farklı bir tarayıcıda ya da gizli sekmede açarsan notların orada görünmez. Tarayıcı verilerini temizlersen notlar silinir. Bu yüzden ara sıra **⬇ Yedeği indir** ile yedek al.
