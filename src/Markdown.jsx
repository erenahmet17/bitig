import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';

// "metin\n---" ya da "metin\n===" Markdown'da metni dev bir başlığa çevirir (setext başlık).
// LLM çıktılarında --- hep ayraç olarak kullanıldığı için bu özelliği kapatıyoruz;
// böylece --- her zaman yatay çizgi olur.
function remarkNoSetextHeadings() {
  const data = this.data();
  (data.micromarkExtensions || (data.micromarkExtensions = [])).push({ disable: { null: ['setextUnderline'] } });
}
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';

// LLM'ler formülleri çoğu zaman \( ... \) ve \[ ... \] ile yazar,
// remark-math ise $ ... $ ve $$ ... $$ bekler. Kod blokları hariç dönüştürüyoruz.
function normalizeMath(text) {
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // kod bloğu, dokunma
      return part
        .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$\n${m.trim()}\n$$\n`)
        .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m.trim()}$`);
    })
    .join('');
}

export default function Markdown({ children }) {
  return (
    <div className="md">
      <ReactMarkdown
        // remarkBreaks: tek satır atlamaları da korunur (yapıştırılan metinde satırlar birleşmesin)
        remarkPlugins={[remarkGfm, remarkMath, remarkNoSetextHeadings, remarkBreaks]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false }], [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {normalizeMath(children || '')}
      </ReactMarkdown>
    </div>
  );
}
