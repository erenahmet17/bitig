import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export const { TextLayer } = pdfjsLib;

// Aynı PDF'i her seferinde baştan açmamak için açılmış belgeleri saklıyoruz
const cache = new Map();

export function loadPdf(record) {
  const key = record.id + ':' + record.size;
  if (!cache.has(key)) {
    const p = record.data.arrayBuffer().then((buf) => pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key);
}
