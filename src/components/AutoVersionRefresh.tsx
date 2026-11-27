import { useEffect } from 'react';
import { toast } from 'sonner';

// A nova versão é consultada sem cache. Não interrompe formulários em edição.
export default function AutoVersionRefresh() {
  useEffect(() => {
    let stopped = false;
    let activeVersion: string | null = null;
    let hasUpdate = false;
    let announced = false;
    let lastInteraction = Date.now();
    const touch = () => {
      lastInteraction = Date.now();
    };
    const safeToReload = () => {
      const el = document.activeElement;
      const editing =
        el instanceof HTMLElement &&
        (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
      const dialog = document.querySelector(
        '[role="dialog"], [data-state="open"][role="alertdialog"]'
      );
      return (
        !editing &&
        !dialog &&
        !document.querySelector('[data-jf-workspace-editing="true"]') &&
        Date.now() - lastInteraction > 60000
      );
    };
    const reload = () => window.location.reload();
    const check = async () => {
      try {
        const response = await fetch('/version.json', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = (await response.json()) as { version?: string };
        const next = payload.version;
        if (!next || stopped) return;
        if (!activeVersion) {
          activeVersion = next;
          return;
        }
        if (activeVersion !== next) hasUpdate = true;
        if (!hasUpdate) return;
        if (safeToReload()) {
          reload();
          return;
        }
        if (!announced) {
          announced = true;
          toast.info('Nova versão do JapanFlow disponível', {
            duration: Infinity,
            description:
              'A atualização será aplicada automaticamente quando você terminar sua atividade.',
            action: { label: 'Atualizar agora', onClick: reload },
          });
        }
      } catch {
        /* Falha de rede não deve interromper o usuário. */
      }
    };
    for (const event of ['pointerdown', 'keydown', 'input'])
      window.addEventListener(event, touch, { passive: true });
    const id = window.setInterval(() => {
      void check();
    }, 30000);
    void check();
    const onFocus = () => {
      void check();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      for (const event of ['pointerdown', 'keydown', 'input'])
        window.removeEventListener(event, touch);
    };
  }, []);
  return null;
}
