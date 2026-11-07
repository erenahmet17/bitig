import { useEffect, useState } from 'react';

// Tarayıcının "uygulamayı yükle" teklifini yakalar; uygun olduğunda bir buton göstermemizi sağlar.
let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  notify();
});

export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    notify();
  };

  return { canInstall: !!deferredPrompt, install };
}

// Tarayıcıdan, yer darlığında bile bu uygulamanın verilerini silmemesini iste
export function requestPersistentStorage() {
  try {
    navigator.storage?.persist?.();
  } catch {}
}
