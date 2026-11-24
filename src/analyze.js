// "Analiz ettir": bir dersin/bölümün tüm soru-cevaplarını, yapay zekâya
// yapıştırılmaya hazır tek bir metne (talimat + veri) çevirir.

export const GOALS = [
  {
    id: 'gaps',
    label: 'Eksiklerimi bul',
    hint: 'Zorlandığın konuları, anlamadığın kavramları ve hiç çalışmamış görünen konuları çıkarır.',
    task: `Bu soru-cevaplara bakarak nerede zorlandığımı ve neyi eksik bildiğimi bulmanı istiyorum:
1. **En çok zorlandığım konular:** Aynı konuda tekrar tekrar sorduğum, takip sorusu sorduğum ya da "Tekrar bak" diye işaretlediğim yerleri grupla; her grup için neden zorlanıyor olabileceğimi kısaca yaz.
2. **Eksik ya da yanlış anladığım kavramlar:** Sorularımın soruluş biçiminden anlaşılan temel eksikleri listele.
3. **Hiç çalışmamış göründüğüm konular:** Bu dersin/bölümün kapsamında olup sorularımda hiç geçmeyen önemli konular neler?
4. **Öncelik sırası:** Hangisinden başlamam gerektiğini, en kritikten başlayarak sırala.
Kısa ve maddeler halinde yaz.`,
  },
  {
    id: 'plan',
    label: 'Çalışma planı çıkar',
    hint: 'Zayıf noktalarına göre adım adım bir çalışma planı hazırlar.',
    task: `Bu soru-cevaplara bakarak zayıf olduğum konuları belirle ve bana adım adım bir çalışma planı hazırla:
- Önce kısaca hangi konularda zorlandığımı özetle ("Tekrar bak" işaretli sorular ve aynı konuda tekrar tekrar sorduklarım en güçlü ipuçları).
- Sonra konuları en kritikten başlayarak sırala; her konu için neyi tekrar etmem, hangi kavramı oturtmam ve kendimi nasıl kontrol edeceğimi yaz.
- "Anladım" işaretli konulara sadece kısa bir tekrar ayır.
- Plan uygulanabilir ve kısa olsun.`,
  },
  {
    id: 'quiz',
    label: 'Beni sına',
    hint: 'Zayıf olduğun konulardan yeni sorular sorar, cevabını bekler.',
    task: `Bu soru-cevaplara bakarak zayıf olduğum konuları belirle ve beni o konularda sına:
- Önce tek cümleyle hangi konulara odaklanacağını söyle.
- Sonra bana **tek tek** yeni sorular sor (buradaki soruların aynısını değil, aynı konuları farklı açılardan yoklayan sorular). Kolaydan zora git.
- Her sorudan sonra benim cevabımı bekle; cevabımı değerlendir, yanlışsa doğrusunu kısaca açıkla, sonra sıradaki soruya geç.
- "Tekrar bak" işaretli sorulardaki konulara daha çok ağırlık ver.`,
  },
];

const STATUS_LABEL = { review: 'Tekrar bak', known: 'Anladım' };

// data: collectExport() çıktısı
export function buildAnalysisText(data, { goal = 'gaps', answers = true } = {}) {
  const g = GOALS.find((x) => x.id === goal) || GOALS[0];
  const where = [...data.path, data.title].join(' › ');
  const qas = data.sections.flatMap((s) => s.groups.flatMap((gr) => gr.qas));
  const review = qas.filter((q) => q.status === 'review').length;
  const known = qas.filter((q) => q.status === 'known').length;

  const lines = [];
  lines.push(`Ders çalışıyorum. Aşağıda **${where}** için yapay zekâya sorduğum sorular${answers ? ' ve aldığım cevaplar' : ''} var (toplam ${qas.length} soru).`);
  lines.push('');
  lines.push('Okurken bilmen gerekenler:');
  lines.push(`- Soruların yanındaki **[Tekrar bak]** işareti, o soruyu anlamadığımı ya da tekrar çalışmam gerektiğini kendim işaretlediğim anlamına gelir (${review} soru). **[Anladım]** ise o konuyu anladığımı gösterir (${known} soru). İşaretsiz sorular henüz değerlendirilmedi.`);
  lines.push('- Sorular, benim sorduğum sırayla ve bölümlere göre gruplu; "Sayfa N" başlıkları, sorunun ders PDF\'inin hangi sayfasıyla ilgili olduğunu gösterir.');
  if (!answers) lines.push('- Metni kısa tutmak için cevapları eklemedim; sadece neyi sorduğuma bakarak değerlendir.');
  lines.push('');
  lines.push('**Senden istediğim:**');
  lines.push(g.task);
  lines.push('');
  lines.push('---');
  lines.push('');

  let n = 0;
  for (const s of data.sections) {
    if (s.depth > 0) lines.push(`${'#'.repeat(Math.min(s.depth + 1, 4))} ${s.name}`, '');
    else lines.push(`# ${s.name}`, '');
    for (const gr of s.groups) {
      if (gr.page) lines.push(`**Sayfa ${gr.page}**`, '');
      for (const q of gr.qas) {
        n++;
        const mark = STATUS_LABEL[q.status] ? ` [${STATUS_LABEL[q.status]}]` : '';
        const img = q.image ? ' _(Bu soruya bir görsel eklenmişti; görsel bu metinde yok.)_' : '';
        const question = (q.question || '').trim().replace(/\n+/g, ' / ');
        lines.push(`**S${n}.**${mark} ${question || '(görüntülü soru)'}${img}`);
        if (answers) {
          lines.push('');
          lines.push((q.answer || '').trim() || '_(cevap yok)_');
        }
        lines.push('');
      }
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// Yaklaşık uzunluk bilgisi (Türkçe için ~3,5 karakter ≈ 1 token)
export function sizeInfo(text) {
  const chars = text.length;
  const tokens = Math.round(chars / 3.5);
  return { chars, tokens, level: tokens > 60000 ? 'high' : tokens > 20000 ? 'mid' : 'ok' };
}
