import { getLang } from './i18n.js';

// "Analiz ettir": bir dersin/bölümün tüm soru-cevaplarını, yapay zekâya
// yapıştırılmaya hazır tek bir metne (talimat + veri) çevirir.

export const GOALS = [
  {
    id: 'gaps',
    labelKey: 'analyze.goal.gaps.label',
    hintKey: 'analyze.goal.gaps.hint',
    task: {
      tr: `Bu soru-cevaplara bakarak nerede zorlandığımı ve neyi eksik bildiğimi bulmanı istiyorum:
1. **En çok zorlandığım konular:** Aynı konuda tekrar tekrar sorduğum, takip sorusu sorduğum ya da "Tekrar bak" diye işaretlediğim yerleri grupla; her grup için neden zorlanıyor olabileceğimi kısaca yaz.
2. **Eksik ya da yanlış anladığım kavramlar:** Sorularımın soruluş biçiminden anlaşılan temel eksikleri listele.
3. **Hiç çalışmamış göründüğüm konular:** Bu dersin/bölümün kapsamında olup sorularımda hiç geçmeyen önemli konular neler?
4. **Öncelik sırası:** Hangisinden başlamam gerektiğini, en kritikten başlayarak sırala.
Kısa ve maddeler halinde yaz.`,
      en: `Based on these Q&As, please identify where I am struggling and what gaps I have:
1. **Hardest topics:** Group the places where I asked repeated or follow-up questions, or marked "Review"; briefly explain why I might be struggling with each group.
2. **Missing or misunderstood concepts:** List foundational gaps implied by how I phrased my questions.
3. **Potentially uncovered topics:** What important topics within this course/section never came up in my questions?
4. **Priority order:** Rank what I should study first, starting with the most critical.
Keep it concise and bulleted.`,
    },
  },
  {
    id: 'plan',
    labelKey: 'analyze.goal.plan.label',
    hintKey: 'analyze.goal.plan.hint',
    task: {
      tr: `Bu soru-cevaplara bakarak zayıf olduğum konuları belirle ve bana adım adım bir çalışma planı hazırla:
- Önce kısaca hangi konularda zorlandığımı özetle ("Tekrar bak" işaretli sorular ve aynı konuda tekrar tekrar sorduklarım en güçlü ipuçları).
- Sonra konuları en kritikten başlayarak sırala; her konu için neyi tekrar etmem, hangi kavramı oturtmam ve kendimi nasıl kontrol edeceğimi yaz.
- "Anladım" işaretli konulara sadece kısa bir tekrar ayır.
- Plan uygulanabilir ve kısa olsun.`,
      en: `Based on these Q&As, identify my weak areas and build a step-by-step study plan:
- First briefly summarize which topics I struggled with ("Review" marks and repeated questions are the strongest signals).
- Then order the topics from most critical to least; for each, specify what to review, which core concept to solidify, and how to test myself.
- Allocate only a quick refresher for topics marked "Got it".
- Keep the plan practical and concise.`,
    },
  },
  {
    id: 'quiz',
    labelKey: 'analyze.goal.quiz.label',
    hintKey: 'analyze.goal.quiz.hint',
    task: {
      tr: `Bu soru-cevaplara bakarak zayıf olduğum konuları belirle ve beni o konularda sına:
- Önce tek cümleyle hangi konulara odaklanacağını söyle.
- Sonra bana **tek tek** yeni sorular sor (buradaki soruların aynısını değil, aynı konuları farklı açılardan yoklayan sorular). Kolaydan zora git.
- Her sorudan sonra benim cevabımı bekle; cevabımı değerlendir, yanlışsa doğrusunu kısaca açıkla, sonra sıradaki soruya geç.
- "Tekrar bak" işaretli sorulardaki konulara daha çok ağırlık ver.`,
      en: `Based on these Q&As, identify my weak areas and quiz me on them:
- First state in one sentence which topics you will focus on.
- Then ask me new questions **one at a time** (not copies of these questions, but fresh angles testing the same concepts), progressing from easier to harder.
- Wait for my answer after each question; evaluate it, briefly explain the right answer if I'm wrong, then move to the next question.
- Give extra weight to topics from questions marked "Review".`,
    },
  },
];

// data: collectExport() çıktısı
export function buildAnalysisText(data, { goal = 'gaps', answers = true, lang = getLang() } = {}) {
  const isEn = lang === 'en';
  const statusLabel = isEn ? { review: 'Review', known: 'Got it' } : { review: 'Tekrar bak', known: 'Anladım' };
  const g = GOALS.find((x) => x.id === goal) || GOALS[0];
  const where = [...data.path, data.title].join(' › ');
  const qas = data.sections.flatMap((s) => s.groups.flatMap((gr) => gr.qas));
  const review = qas.filter((q) => q.status === 'review').length;
  const known = qas.filter((q) => q.status === 'known').length;

  const lines = [];
  if (isEn) {
    lines.push(`I am studying. Below are the questions${answers ? ' and answers' : ''} I collected from AI chats for **${where}** (${qas.length} total).`);
    lines.push('');
    lines.push('Context for reading:');
    lines.push(
      `- **[Review]** next to a question means I marked it as needing more study (${review} questions). **[Got it]** means I understood it (${known} questions). Unmarked questions have not been rated yet.`
    );
    lines.push('- Questions are grouped by section in the order I asked them; "Page N" headers indicate the related page in my study PDF.');
    if (!answers) lines.push('- Answers are omitted to keep this concise; please evaluate based on what I asked.');
    lines.push('');
    lines.push('**What I want from you:**');
    lines.push(g.task.en);
  } else {
    lines.push(`Ders çalışıyorum. Aşağıda **${where}** için yapay zekâya sorduğum sorular${answers ? ' ve aldığım cevaplar' : ''} var (toplam ${qas.length} soru).`);
    lines.push('');
    lines.push('Okurken bilmen gerekenler:');
    lines.push(
      `- Soruların yanındaki **[Tekrar bak]** işareti, o soruyu anlamadığımı ya da tekrar çalışmam gerektiğini kendim işaretlediğim anlamına gelir (${review} soru). **[Anladım]** ise o konuyu anladığımı gösterir (${known} soru). İşaretsiz sorular henüz değerlendirilmedi.`
    );
    lines.push('- Sorular, benim sorduğum sırayla ve bölümlere göre gruplu; "Sayfa N" başlıkları, sorunun ders PDF\'inin hangi sayfasıyla ilgili olduğunu gösterir.');
    if (!answers) lines.push('- Metni kısa tutmak için cevapları eklemedim; sadece neyi sorduğuma bakarak değerlendir.');
    lines.push('');
    lines.push('**Senden istediğim:**');
    lines.push(g.task.tr);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  let n = 0;
  for (const s of data.sections) {
    if (s.depth > 0) lines.push(`${'#'.repeat(Math.min(s.depth + 1, 4))} ${s.name}`, '');
    else lines.push(`# ${s.name}`, '');
    for (const gr of s.groups) {
      if (gr.page) lines.push(`**${isEn ? 'Page' : 'Sayfa'} ${gr.page}**`, '');
      for (const q of gr.qas) {
        n++;
        const mark = statusLabel[q.status] ? ` [${statusLabel[q.status]}]` : '';
        const img = q.image
          ? isEn
            ? ' _(An image was attached to this question; omitted from text.)_'
            : ' _(Bu soruya bir görsel eklenmişti; görsel bu metinde yok.)_'
          : '';
        const question = (q.question || '').trim().replace(/\n+/g, ' / ');
        const prefix = isEn ? `**Q${n}.**` : `**S${n}.**`;
        const fallbackQ = isEn ? '(image question)' : '(görüntülü soru)';
        lines.push(`${prefix}${mark} ${question || fallbackQ}${img}`);
        if (answers) {
          lines.push('');
          lines.push((q.answer || '').trim() || (isEn ? '_(no answer)_' : '_(cevap yok)_'));
        }
        lines.push('');
      }
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// Yaklaşık uzunluk bilgisi (~3,5 karakter ≈ 1 token)
export function sizeInfo(text) {
  const chars = text.length;
  const tokens = Math.round(chars / 3.5);
  return { chars, tokens, level: tokens > 60000 ? 'high' : tokens > 20000 ? 'mid' : 'ok' };
}
