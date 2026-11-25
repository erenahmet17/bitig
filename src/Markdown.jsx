import { isValidElement, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check } from 'lucide-react';
import { useT } from './i18n.js';

// "metin\n---" ya da "metin\n===" Markdown'da metni dev bir başlığa çevirir (setext başlık).
// LLM çıktılarında --- hep ayraç olarak kullanıldığı için bu özelliği kapatıyoruz;
// böylece --- her zaman yatay çizgi olur.
export function remarkNoSetextHeadings() {
  const data = this.data();
  (data.micromarkExtensions || (data.micromarkExtensions = [])).push({ disable: { null: ['setextUnderline'] } });
}

// LLM'ler formülleri çoğu zaman \( ... \) ve \[ ... \] ile yazar,
// remark-math ise $ ... $ ve $$ ... $$ bekler. Kod blokları hariç dönüştürüyoruz.
export function normalizeMath(text) {
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

function CodeBlock({ children, ...rest }) {
  const { t } = useT();
  const preRef = useRef(null);
  const [copied, setCopied] = useState(false);

  let lang = '';
  if (isValidElement(children)) {
    const cls = String(children.props?.className || '');
    lang = (cls.match(/language-([\w+#-]+)/) || [])[1] || '';
  }

  const copy = async () => {
    const text = (preRef.current?.textContent || '').replace(/\n$/, '');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <div className="code-block">
      <div className="code-bar">
        <span className="code-lang">{lang}</span>
        <button type="button" className={'code-copy' + (copied ? ' ok' : '')} onClick={copy} title={copied ? t('common.copied') : t('common.copy')}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          <span>{copied ? t('common.copied') : t('common.copy')}</span>
        </button>
      </div>
      <pre ref={preRef} {...rest}>
        {children}
      </pre>
    </div>
  );
}

export default function Markdown({ children, copyable = true }) {
  const components = copyable
    ? { a: (props) => <a {...props} target="_blank" rel="noreferrer" />, pre: CodeBlock }
    : { a: (props) => <a {...props} target="_blank" rel="noreferrer" /> };

  return (
    <div className="md">
      <ReactMarkdown
        // remarkBreaks: tek satır atlamaları da korunur (yapıştırılan metinde satırlar birleşmesin)
        remarkPlugins={[remarkGfm, remarkMath, remarkNoSetextHeadings, remarkBreaks]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false }], [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {normalizeMath(children || '')}
      </ReactMarkdown>
    </div>
  );
}
