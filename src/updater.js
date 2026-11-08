import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

// Yeni sürüm kontrolü:
// - uygulama açılırken, pencereye geri dönülünce ve açık kaldığı sürece saatte bir bakılır
// - yeni sürüm hazırsa ve yarım kalan bir yazı yoksa kendiliğinden yüklenir
// - yazı yarımsa sol altta "Yeni sürüm hazır · Yenile" görünür, form kapanınca yine denenir

const HOUR = 60 * 60 * 1000;
let ready = false;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

// Kaybolabilecek yazı var mı? (soru-cevap formu, not, ad kutusu)
function hasUnsavedText() {
  return [...document.querySelectorAll('.qa-form textarea, .qa-form input, .note-pop textarea, .inline-input')].some(
    (el) => el.value && el.value.trim()
  );
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    ready = true;
    notify();
    tryApply();
  },
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => {
      if (navigator.onLine !== false) reg.update().catch(() => {});
    };
    setInterval(check, HOUR);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
  },
});

function tryApply() {
  if (!ready) return;
  if (hasUnsavedText()) {
    setTimeout(tryApply, 30 * 1000); // yazı bitince tekrar dene
    return;
  }
  applyUpdate();
}

// Yeni service worker devreye girince sayfayı yenile. (Kütüphanenin kendi yenilemesi
// her durumda tetiklenmiyor; o yüzden controllerchange'i kendimiz dinliyoruz ve
// birkaç saniye içinde olmazsa yine de yeniliyoruz.)
let reloading = false;
export function applyUpdate() {
  if (reloading) return;
  reloading = true;
  const reload = () => window.location.reload();
  navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true });
  setTimeout(reload, 4000);
  updateSW(true);
}

export function useUpdateReady() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return ready;
}
