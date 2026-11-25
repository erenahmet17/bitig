import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  AlignmentType,
  HeadingLevel,
  LevelFormat,
  ImportedXmlComponent,
} from 'docx';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import katex from 'katex';
import { mml2omml } from 'mathml2omml';
import { normalizeMath, remarkNoSetextHeadings } from '../Markdown.jsx';
import { formatDate } from './collect.js';
import { t } from '../i18n.js';

const ACCENT = '4F5BD5';
const MUTED = '80848D';
const CODE_BG = 'F3F2EE';
const BORDER = 'D3D2CC';
const MONO = 'Consolas';

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkNoSetextHeadings).use(remarkBreaks);
const parseMd = (md) => processor.runSync(processor.parse(normalizeMath(md || '')));

// LaTeX → MathML (KaTeX) → Word denklemi (OMML); düzenlenebilir gerçek denklem olarak çıkar
function mathRun(tex) {
  try {
    const html = katex.renderToString(tex, { output: 'mathml', throwOnError: true });
    const mml = html.match(/<math[\s\S]*<\/math>/)[0].replace(/<annotation[\s\S]*?<\/annotation>/g, '');
    const omml = mml2omml(mml).replace(/<w:rPr\/>/g, '').replace(/<m:sty m:val="undefined"\/>/g, '');
    return ImportedXmlComponent.fromXmlString(omml).root[0];
  } catch {
    return new TextRun({ text: tex, font: 'Cambria Math' });
  }
}

// ---------- Satır içi öğeler ----------
function inlines(nodes, st = {}) {
  const out = [];
  for (const n of nodes || []) {
    switch (n.type) {
      case 'text':
        out.push(new TextRun({ text: n.value, bold: st.bold, italics: st.italics, strike: st.strike, size: st.size, style: st.link ? 'Hyperlink' : undefined }));
        break;
      case 'strong':
        out.push(...inlines(n.children, { ...st, bold: true }));
        break;
      case 'emphasis':
        out.push(...inlines(n.children, { ...st, italics: true }));
        break;
      case 'delete':
        out.push(...inlines(n.children, { ...st, strike: true }));
        break;
      case 'inlineCode':
        out.push(new TextRun({ text: n.value, font: MONO, size: 19, bold: st.bold, shading: { type: ShadingType.CLEAR, fill: CODE_BG, color: 'auto' } }));
        break;
      case 'break':
        out.push(new TextRun({ break: 1 }));
        break;
      case 'inlineMath':
        out.push(mathRun(n.value));
        break;
      case 'link':
        out.push(new ExternalHyperlink({ link: n.url, children: inlines(n.children, { ...st, link: true }) }));
        break;
      case 'image':
        out.push(new TextRun({ text: n.alt ? `[${n.alt}]` : '[görsel]', italics: true, color: MUTED }));
        break;
      case 'html':
        out.push(new TextRun({ text: n.value, bold: st.bold }));
        break;
      default:
        if (n.children) out.push(...inlines(n.children, st));
        else if (n.value) out.push(new TextRun({ text: n.value }));
    }
  }
  return out;
}

// ---------- Blok öğeler ----------
// ctx: { indent, quote, list: { ordered, level, instance } }
function para(children, ctx, extra = {}) {
  const opts = { children, spacing: { after: 100, line: 300 }, ...extra };
  const left = (ctx.indent || 0) + (ctx.quote ? 280 : 0);
  if (left && !extra.numbering && !extra.bullet) opts.indent = { left };
  if (ctx.quote) {
    opts.border = { left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 10 } };
    opts.shading = { type: ShadingType.CLEAR, fill: 'EEF0FD', color: 'auto' };
  }
  return new Paragraph(opts);
}

let listInstance = 0;

function blocks(nodes, ctx = {}) {
  const out = [];
  for (const n of nodes || []) {
    switch (n.type) {
      case 'paragraph':
        out.push(para(inlines(n.children), ctx));
        break;
      case 'heading': {
        const size = [30, 27, 25, 23, 22, 22][n.depth - 1];
        out.push(para(inlines(n.children, { bold: true, size }), ctx, { spacing: { before: 200, after: 100 }, keepNext: true }));
        break;
      }
      case 'code': {
        const lines = n.value.split('\n');
        lines.forEach((line, i) =>
          out.push(
            new Paragraph({
              children: [new TextRun({ text: line || ' ', font: MONO, size: 19 })],
              shading: { type: ShadingType.CLEAR, fill: CODE_BG, color: 'auto' },
              indent: { left: (ctx.indent || 0) + 120, right: 120 },
              spacing: { before: i === 0 ? 120 : 0, after: i === lines.length - 1 ? 160 : 0, line: 264 },
              keepLines: true,
              keepNext: i < lines.length - 1,
            })
          )
        );
        break;
      }
      case 'math':
        out.push(para([mathRun(n.value)], ctx, { alignment: AlignmentType.CENTER, spacing: { before: 120, after: 160 } }));
        break;
      case 'blockquote':
        out.push(...blocks(n.children, { ...ctx, quote: true }));
        break;
      case 'list': {
        const level = ctx.list ? ctx.list.level + 1 : 0;
        const instance = ++listInstance;
        for (const item of n.children) {
          const kids = item.children || [];
          let first = true;
          for (const k of kids) {
            if (k.type === 'paragraph' && first) {
              const prefix = item.checked === true ? '☑ ' : item.checked === false ? '☐ ' : '';
              const runs = inlines(k.children);
              if (prefix) runs.unshift(new TextRun(prefix));
              out.push(
                para(
                  runs,
                  ctx,
                  n.ordered ? { numbering: { reference: 'ol', level: Math.min(level, 5), instance }, spacing: { after: 60, line: 300 } } : { bullet: { level: Math.min(level, 5) }, spacing: { after: 60, line: 300 } }
                )
              );
              first = false;
            } else if (k.type === 'list') {
              out.push(...blocks([k], { ...ctx, list: { level } }));
            } else {
              out.push(...blocks([k], { ...ctx, indent: 720 * (level + 1) }));
              first = false;
            }
          }
        }
        break;
      }
      case 'table': {
        const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: BORDER };
        const rows = n.children.map(
          (row, ri) =>
            new TableRow({
              tableHeader: ri === 0,
              children: row.children.map(
                (cell, ci) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: inlines(cell.children, { bold: ri === 0 }),
                        alignment: { center: AlignmentType.CENTER, right: AlignmentType.RIGHT }[n.align?.[ci]] || AlignmentType.LEFT,
                        spacing: { before: 40, after: 40 },
                      }),
                    ],
                    shading: ri === 0 ? { type: ShadingType.CLEAR, fill: CODE_BG, color: 'auto' } : undefined,
                    margins: { left: 100, right: 100 },
                    borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
                  })
              ),
            })
        );
        out.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, indent: ctx.indent ? { size: ctx.indent, type: WidthType.DXA } : undefined }));
        out.push(new Paragraph({ children: [], spacing: { after: 60 } }));
        break;
      }
      case 'thematicBreak':
        out.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDER, space: 1 } }, spacing: { after: 160 } }));
        break;
      case 'html':
        out.push(para([new TextRun(n.value)], ctx));
        break;
      default:
        if (n.children) out.push(...blocks(n.children, ctx));
    }
  }
  return out;
}

// Soru görselini PNG'ye çevirip sayfa genişliğine sığdır
async function imageParagraph(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    const png = await new Promise((r) => c.toBlob(r, 'image/png'));
    const data = await png.arrayBuffer();
    const maxW = 560;
    const maxH = 420;
    const k = Math.min(1, maxW / bmp.width, maxH / bmp.height);
    return new Paragraph({
      children: [new ImageRun({ type: 'png', data, transformation: { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) } })],
      indent: { left: 360 },
      spacing: { before: 80, after: 120 },
    });
  } catch {
    return null;
  }
}

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

export async function exportWord(data, { answers }) {
  listInstance = 0;
  const children = [];
  if (data.path.length) children.push(new Paragraph({ children: [new TextRun({ text: data.path.join(' › '), color: MUTED, size: 20 })], spacing: { after: 40 } }));
  children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(data.title)] }));
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `${t('export.docCount', { n: data.total })} · ${answers ? t('export.metaQa') : t('export.metaQ')} · ${formatDate()}`, color: MUTED, size: 20 })],
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 6 } },
      spacing: { after: 300 },
    })
  );

  let num = 0;
  for (const s of data.sections) {
    if (s.depth > 0) children.push(new Paragraph({ heading: HEADINGS[Math.min(s.depth - 1, 3)], children: [new TextRun(s.name)], keepNext: true }));
    for (const g of s.groups) {
      if (g.page)
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `${t('common.page')} ${g.page}`, bold: true, color: ACCENT, size: 20 })],
            spacing: { before: 200, after: 80 },
            keepNext: true,
          })
        );
      for (const q of g.qas) {
        num++;
        const lines = (q.question || '').split('\n');
        const qRuns = [new TextRun({ text: `${num}. `, bold: true, color: ACCENT })];
        lines.forEach((l, i) => qRuns.push(new TextRun({ text: l, bold: true, break: i > 0 ? 1 : 0 })));
        children.push(new Paragraph({ children: qRuns, spacing: { before: 200, after: 80 }, keepNext: true, keepLines: true }));
        if (q.image) {
          const p = await imageParagraph(q.image);
          if (p) children.push(p);
        }
        if (answers) {
          const body = blocks(parseMd(q.answer).children, { indent: 360 });
          children.push(...(body.length ? body : [para([new TextRun({ text: t('common.noAnswer'), italics: true, color: MUTED })], { indent: 360 })]));
        } else {
          for (let i = 0; i < 4; i++) children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
        }
      }
    }
  }

  const doc = new Document({
    creator: 'Bitig',
    title: data.title,
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
    },
    numbering: {
      config: [
        {
          reference: 'ol',
          levels: [0, 1, 2, 3, 4, 5].map((l) => ({
            level: l,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][l % 3],
            text: `%${l + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 360 + 720 * (l + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children }],
  });
  return Packer.toBlob(doc);
}
