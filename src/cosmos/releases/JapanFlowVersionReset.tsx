import { useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { installedVersion, isNativeAndroid } from './nativeUpdater';

const LAST_VERSION = 'japanflow.android.lastSeenVersion';
export default function JapanFlowVersionReset() {
  const { logout } = useApp();
  useEffect(() => {
    if (!isNativeAndroid()) return;
    let active = true;
    void installedVersion()
      .then(async (version) => {
        if (!active || !version) return;
        const previous = localStorage.getItem(LAST_VERSION);
        localStorage.setItem(LAST_VERSION, version);
        if (previous && previous !== version) {
          // Após uma atualização instalada, exigir novo login sem perder documentos do usuário.
          await logout();
          if (active) window.location.hash = '#/login';
        }
      })
      .catch((e) => console.warn('Não foi possível registrar versão do JapanFlow', e));
    return () => {
      active = false;
    };
  }, [logout]);
  return null;
}
