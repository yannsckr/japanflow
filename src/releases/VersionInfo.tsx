import { useEffect, useState } from 'react';
import { installedVersion, isNativeAndroid } from './nativeUpdater';
export default function VersionInfo({ withCheck = false }: { withCheck?: boolean }) {
  const [version, setVersion] = useState('');
  useEffect(() => {
    void installedVersion()
      .then(setVersion)
      .catch(() => setVersion('indisponível'));
  }, []);
  if (!isNativeAndroid()) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '10px 12px',
        fontSize: 12,
        color: '#647a6f',
      }}
    >
      <span>JapanFlow v{version || '…'}</span>
      {withCheck && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('japanflow:check-updates'))}
          style={{ textDecoration: 'underline' }}
        >
          Verificar atualizações
        </button>
      )}
    </div>
  );
}
