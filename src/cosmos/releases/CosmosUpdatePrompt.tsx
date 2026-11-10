import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, X, Sparkles } from 'lucide-react';
import { compareVersions, subscribeCosmosReleases, type CosmosRelease } from './releaseService';

// Sincronize esta constante com o versionName do build Android antes de publicar.
const INSTALLED_VERSION = import.meta.env.VITE_COSMOS_APP_VERSION || '0.0.0';
export default function CosmosUpdatePrompt() {
  const [items, setItems] = useState<CosmosRelease[]>([]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(
    () =>
      subscribeCosmosReleases(setItems, (e) => console.warn('JapanFlow releases indisponíveis', e)),
    []
  );
  const latest = useMemo(
    () =>
      items
        .filter(
          (r) =>
            r.status === 'published' &&
            r.channel === 'stable' &&
            compareVersions(r.version, INSTALLED_VERSION) > 0
        )
        .sort((a, b) => compareVersions(b.version, a.version))[0],
    [items]
  );
  if (!latest || (!latest.mandatory && dismissed === latest.id)) return null;
  const download =
    latest.downloadUrl &&
    (() => {
      try {
        return new URL(latest.downloadUrl).protocol === 'https:';
      } catch {
        return false;
      }
    })();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Atualização JapanFlow"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0,0,0,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: '100%',
          background: 'var(--background, #fff)',
          color: 'var(--foreground, #111)',
          borderRadius: 22,
          padding: 24,
          boxShadow: '0 24px 80px #0005',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700 }}>
            <Sparkles size={20} /> JapanFlow {latest.version}
          </div>
          {!latest.mandatory && (
            <button aria-label="Fechar" onClick={() => setDismissed(latest.id)}>
              <X size={20} />
            </button>
          )}
        </div>
        <h2 style={{ fontSize: 21, fontWeight: 700, margin: '18px 0 8px' }}>{latest.title}</h2>
        <p
          style={{
            whiteSpace: 'pre-wrap',
            fontSize: 14,
            lineHeight: 1.6,
            maxHeight: '40vh',
            overflowY: 'auto',
          }}
        >
          {latest.notes}
        </p>
        {latest.mandatory && (
          <p style={{ fontSize: 12, marginTop: 12 }}>
            Esta versão foi marcada como obrigatória pela equipe TI.
          </p>
        )}
        {download ? (
          <a
            href={latest.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 20,
              padding: 13,
              borderRadius: 12,
              background: '#182b27',
              color: 'white',
              fontWeight: 600,
            }}
          >
            <ArrowDownToLine size={18} /> Baixar atualização
          </a>
        ) : (
          <p style={{ marginTop: 20, fontSize: 13 }}>
            A atualização ainda não tem APK disponível. Entre em contato com a equipe TI.
          </p>
        )}
        {!latest.mandatory && (
          <button
            onClick={() => setDismissed(latest.id)}
            style={{ display: 'block', margin: '12px auto 0', fontSize: 13 }}
          >
            Mais tarde
          </button>
        )}
      </div>
    </div>
  );
}
