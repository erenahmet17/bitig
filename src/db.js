import Dexie from 'dexie';
import { blobToDataURL } from './utils.js';

// Veriler tarayıcının IndexedDB'sinde tutulur.
// sections:    dersler (parentId = '') ve onların altındaki bölümler (iç içe)
// qas:         bir bölüme ait soru-cevaplar (page: bağlı olduğu PDF sayfası, yoksa null)
// pdfs:        bir bölüme yüklenmiş PDF (her bölüme en fazla bir tane)
// annotations: PDF sayfalarındaki vurgu, kalem çizimi ve notlar
export const db = new Dexie('bitig');

db.version(1).stores({
  sections: 'id, parentId, order',
  qas: 'id, sectionId, order',
});

db.version(2).stores({
  sections: 'id, parentId, order',
  qas: 'id, sectionId, order',
  pdfs: 'id, sectionId',
  annotations: 'id, pdfId, [pdfId+page]',
});

// status: 'known' (anladım) | 'review' (tekrar bak) | yoksa işaretsiz
db.version(3).stores({
  sections: 'id, parentId, order',
  qas: 'id, sectionId, order, status',
  pdfs: 'id, sectionId',
  annotations: 'id, pdfId, [pdfId+page]',
});

// Uygulamanın eski adıyla ('ders-defteri') oluşturulmuş veritabanı varsa içeriğini
// yenisine bir kez taşır ve eskisini siler. Yeni veritabanında veri varsa dokunmaz.
export async function migrateOldDb() {
  try {
    if (!(await Dexie.exists('ders-defteri'))) return;
    const old = new Dexie('ders-defteri');
    await old.open(); // mevcut şemayla açılır
    const tables = ['sections', 'qas', 'pdfs', 'annotations'].filter((t) => old.tables.some((x) => x.name === t));
    const data = {};
    for (const t of tables) data[t] = await old.table(t).toArray();
    const hasOld = tables.some((t) => data[t].length);
    const newEmpty = (await db.sections.count()) === 0 && (await db.qas.count()) === 0;
    if (hasOld && newEmpty) {
      await db.transaction('rw', db.sections, db.qas, db.pdfs, db.annotations, async () => {
        for (const t of tables) await db.table(t).bulkPut(data[t]);
      });
    }
    old.close();
    if (!hasOld || newEmpty) await Dexie.delete('ders-defteri');
  } catch (e) {
    console.warn('Eski veritabanı taşınamadı', e);
  }
}

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

async function nextOrder(table, field, value) {
  const items = await db[table].where(field).equals(value).toArray();
  return items.reduce((m, x) => Math.max(m, x.order ?? 0), 0) + 1;
}

// Dexie, null değerini indeksleyemez; kök seviye için '' kullanıyoruz.
export const ROOT = '';

// ---------------- Bölümler ----------------
export async function addSection(parentId, name) {
  const id = uid();
  await db.sections.add({
    id,
    parentId: parentId ?? ROOT,
    name: name.trim(),
    order: await nextOrder('sections', 'parentId', parentId ?? ROOT),
    createdAt: Date.now(),
  });
  return id;
}

export function renameSection(id, name) {
  return db.sections.update(id, { name: name.trim() });
}

// Bir bölümün kendisini ve altındaki her şeyi döndürür.
export async function collectSubtree(id) {
  const ids = [id];
  for (let i = 0; i < ids.length; i++) {
    const children = await db.sections.where('parentId').equals(ids[i]).primaryKeys();
    ids.push(...children);
  }
  const qaCount = await db.qas.where('sectionId').anyOf(ids).count();
  const pdfCount = await db.pdfs.where('sectionId').anyOf(ids).count();
  return { ids, qaCount, pdfCount };
}

export async function deleteSection(id) {
  await db.transaction('rw', db.sections, db.qas, db.pdfs, db.annotations, async () => {
    const { ids } = await collectSubtree(id);
    const pdfIds = await db.pdfs.where('sectionId').anyOf(ids).primaryKeys();
    await db.annotations.where('pdfId').anyOf(pdfIds).delete();
    await db.pdfs.bulkDelete(pdfIds);
    await db.qas.where('sectionId').anyOf(ids).delete();
    await db.sections.bulkDelete(ids);
  });
}

export async function moveItem(table, id, direction) {
  const item = await db[table].get(id);
  const field = table === 'sections' ? 'parentId' : 'sectionId';
  const siblings = await db[table].where(field).equals(item[field]).sortBy('order');
  const i = siblings.findIndex((s) => s.id === id);
  const j = i + direction;
  if (j < 0 || j >= siblings.length) return;
  const other = siblings[j];
  await db.transaction('rw', db[table], async () => {
    await db[table].update(item.id, { order: other.order });
    await db[table].update(other.id, { order: item.order });
  });
}

// Listeyi verilen sıraya göre 1..n olarak yeniden numaralar (sadece değişenleri yazar)
async function writeOrder(table, list, extra = {}) {
  await Promise.all(
    list.map((x, i) => {
      const changes = { ...(extra[x.id] || {}) };
      if (x.order !== i + 1) changes.order = i + 1;
      return Object.keys(changes).length ? db[table].update(x.id, changes) : null;
    })
  );
}

// Sürükle-bırak: soruyu aynı bölümdeki başka bir sorunun önüne/arkasına koyar.
// page verilirse (PDF'te başka sayfanın grubuna bırakıldıysa) sorunun sayfası da değişir.
export async function reorderQA(id, targetId, after, page) {
  await db.transaction('rw', db.qas, async () => {
    const item = await db.qas.get(id);
    if (!item) return;
    const list = (await db.qas.where('sectionId').equals(item.sectionId).sortBy('order')).filter((q) => q.id !== id);
    let idx = list.findIndex((q) => q.id === targetId);
    idx = idx < 0 ? list.length : idx + (after ? 1 : 0);
    list.splice(idx, 0, item);
    await writeOrder('qas', list, page !== undefined ? { [id]: { page } } : {});
  });
}

// Sürükle-bırak: bölümü yeni üst bölüme taşır; targetId verilirse onun önüne/arkasına, yoksa en sona.
export async function moveSection(id, parentId, targetId = null, after = false) {
  const { ids } = await collectSubtree(id);
  if (ids.includes(parentId)) return false; // kendi altına taşınamaz
  await db.transaction('rw', db.sections, async () => {
    const item = await db.sections.get(id);
    const list = (await db.sections.where('parentId').equals(parentId).sortBy('order')).filter((s) => s.id !== id);
    let idx = targetId ? list.findIndex((s) => s.id === targetId) : -1;
    idx = idx < 0 ? list.length : idx + (after ? 1 : 0);
    list.splice(idx, 0, item);
    await writeOrder('sections', list, item.parentId !== parentId ? { [id]: { parentId } } : {});
  });
  return true;
}

// ---------------- Soru-cevaplar ----------------
// image: soruya eklenmiş ekran görüntüsü (Blob) ya da null
export async function addQA(sectionId, question, answer, page = null, image = null) {
  const now = Date.now();
  await db.qas.add({
    id: uid(),
    sectionId,
    question: question.trim(),
    answer: answer.trim(),
    page: page || null,
    image: image || null,
    order: await nextOrder('qas', 'sectionId', sectionId),
    createdAt: now,
    updatedAt: now,
  });
}

export function updateQA(id, question, answer, page, image) {
  const changes = { question: question.trim(), answer: answer.trim(), updatedAt: Date.now() };
  if (page !== undefined) changes.page = page || null;
  if (image !== undefined) changes.image = image || null;
  return db.qas.update(id, changes);
}

export function setQAStatus(id, status) {
  return db.qas.update(id, { status: status || null, statusAt: Date.now() });
}

export function deleteQA(id) {
  return db.qas.delete(id);
}

// ---------------- PDF ----------------
export async function setSectionPdf(sectionId, file) {
  const existing = await db.pdfs.where('sectionId').equals(sectionId).first();
  const record = {
    id: uid(),
    sectionId,
    name: file.name,
    size: file.size,
    data: new Blob([await file.arrayBuffer()], { type: 'application/pdf' }),
    pageCount: null,
    createdAt: Date.now(),
  };
  await db.transaction('rw', db.pdfs, db.annotations, async () => {
    if (existing) {
      await db.annotations.where('pdfId').equals(existing.id).delete();
      await db.pdfs.delete(existing.id);
    }
    await db.pdfs.add(record);
  });
  return record.id;
}

// Yedekten PDF'siz yüklenmiş bir kaydın dosyasını geri koyar (notlar korunur)
export async function restorePdfData(pdfId, file) {
  await db.pdfs.update(pdfId, {
    data: new Blob([await file.arrayBuffer()], { type: 'application/pdf' }),
    size: file.size,
    name: file.name,
  });
}

export async function removeSectionPdf(sectionId) {
  await db.transaction('rw', db.pdfs, db.annotations, async () => {
    const ids = await db.pdfs.where('sectionId').equals(sectionId).primaryKeys();
    await db.annotations.where('pdfId').anyOf(ids).delete();
    await db.pdfs.bulkDelete(ids);
  });
}

// ---------------- İşaretlemeler ----------------
// Koordinatlar sayfa boyutuna göre 0-1 arasında saklanır (yakınlaştırmadan bağımsız).
export async function addAnnotation(pdfId, page, ann) {
  const id = uid();
  await db.annotations.add({ id, pdfId, page, createdAt: Date.now(), ...ann });
  return id;
}

export function updateAnnotation(id, changes) {
  return db.annotations.update(id, changes);
}

export function deleteAnnotation(id) {
  return db.annotations.delete(id);
}

// ---------------- Yedekleme ----------------
export async function exportAll({ includePdfs = true } = {}) {
  const pdfs = [];
  for (const p of await db.pdfs.toArray()) {
    pdfs.push({ ...p, data: includePdfs && p.data ? await blobToDataURL(p.data) : null });
  }
  const qas = [];
  for (const q of await db.qas.toArray()) {
    qas.push(q.image ? { ...q, image: await blobToDataURL(q.image) } : q);
  }
  return {
    app: 'bitig',
    version: 2,
    exportedAt: new Date().toISOString(),
    sections: await db.sections.toArray(),
    qas,
    pdfs,
    annotations: await db.annotations.toArray(),
  };
}

export async function importAll(data, mode) {
  // 'ders-defteri': uygulamanın eski adıyla alınmış yedekler de yüklenebilsin
  if (!data || !['bitig', 'ders-defteri'].includes(data.app) || !Array.isArray(data.sections) || !Array.isArray(data.qas)) {
    throw new Error('Bu dosya bir Bitig yedeği değil.');
  }
  // PDF verisini transaction dışında çözüyoruz (fetch, IndexedDB transaction'ını kapatır)
  const pdfs = [];
  for (const p of data.pdfs || []) {
    pdfs.push({ ...p, data: p.data ? await (await fetch(p.data)).blob() : null });
  }
  const qas = [];
  for (const q of data.qas) {
    qas.push(typeof q.image === 'string' ? { ...q, image: await (await fetch(q.image)).blob() } : q);
  }
  await db.transaction('rw', db.sections, db.qas, db.pdfs, db.annotations, async () => {
    if (mode === 'replace') {
      await Promise.all([db.sections.clear(), db.qas.clear(), db.pdfs.clear(), db.annotations.clear()]);
    }
    // bulkPut: aynı id varsa üzerine yazar, yoksa ekler (birleştirme modu)
    await db.sections.bulkPut(data.sections);
    await db.qas.bulkPut(qas);
    if (mode !== 'replace') {
      // Birleştirirken, cihazdaki PDF dosyasını yedekteki boş kayıtla ezme
      for (const p of pdfs) {
        if (!p.data) {
          const cur = await db.pdfs.get(p.id);
          if (cur?.data) p.data = cur.data;
        }
      }
    }
    await db.pdfs.bulkPut(pdfs);
    await db.annotations.bulkPut(data.annotations || []);
  });
}
