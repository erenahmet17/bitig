import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export const { TextLayer } = pdfjsLib;

// Aynı PDF'i her seferinde baştan açmamak için son açılan belgeleri saklıyoruz (LRU)
const MAX_CACHE = 4;
const cache = new Map();

export function loadPdf(record) {
  const key = record.id + ':' + record.size;
  if (cache.has(key)) {
    const p = cache.get(key);
    cache.delete(key);
    cache.set(key, p);
    return p;
  }
  const p = record.data.arrayBuffer().then((buf) => pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise);
  p.catch(() => cache.delete(key));
  cache.set(key, p);
  if (cache.size > MAX_CACHE) {
    const oldestKey = cache.keys().next().value;
    const oldest = cache.get(oldestKey);
    cache.delete(oldestKey);
    oldest?.then((doc) => doc.destroy?.()).catch(() => {});
  }
  return p;
}

export function evictPdf(pdfId) {
  if (!pdfId) return;
  for (const [key, p] of cache) {
    if (key.startsWith(pdfId + ':')) {
      cache.delete(key);
      p.then((doc) => doc.destroy?.()).catch(() => {});
    }
  }
}
