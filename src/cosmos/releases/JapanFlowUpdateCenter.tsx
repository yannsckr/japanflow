import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, Download, RefreshCw, X } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { compareVersions, subscribeCosmosReleases, type CosmosRelease } from './releaseService';
import {
  installedVersion,
  isNativeAndroid,
  nativeUpdater,
  type DownloadProgress,
} from './nativeUpdater';
import './japanflow-updater.css';

export default function JapanFlowUpdateCenter() {
  const { currentUser } = useApp();
  const [version, setVersion] = useState<string>('');
  const [releases, setReleases] = useState<CosmosRelease[]>([]);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState('');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [visible, setVisible] = useState(false);
  const [beta, setBeta] = useState(() => localStorage.getItem('japanflow.updates.beta') === 'true');

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setVersion(await installedVersion());
      setError('');
    } catch {
      setError('Não foi possível consultar a versão instalada.');
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    if (currentUser && isNativeAndroid()) void refresh();
  }, [currentUser, refresh]);
  useEffect(() => {
    if (!currentUser || !isNativeAndroid()) return;
    return subscribeCosmosReleases(setReleases, () =>
      setError('Não foi possível consultar novas versões.')
    );
  }, [currentUser]);
  useEffect(() => {
    if (!isNativeAndroid()) return;
    let active = true;
    let handle: { remove(): Promise<void> } | undefined;
    void nativeUpdater
      .addListener('progress', (event) => {
        if (!active) return;
        setProgress(event);
        if (event.status === 'complete') setReady(true);
        if (event.status === 'error') setError(event.message || 'Falha no download');
      })
      .then((h) => {
        if (active) handle = h;
        else void h.remove();
      });
    return () => {
      active = false;
      if (handle) void handle.remove();
    };
  }, []);
  const next = useMemo(
    () =>
      releases
        .filter(
          (r) =>
            r.status === 'published' &&
            (r.channel === 'stable' || (beta && r.channel === 'beta')) &&
            !!r.downloadUrl &&
            !!version &&
            compareVersions(r.version, version) > 0
        )
        .sort((a, b) => compareVersions(b.version, a.version))[0],
    [releases, version, beta]
  );
  useEffect(() => {
    if (next && dismissed !== next.id) setVisible(true);
  }, [next, dismissed]);
  useEffect(() => {
    const onCheck = () => {
      setVisible(true);
      void refresh();
    };
    window.addEventListener('japanflow:check-updates', onCheck);
    return () => window.removeEventListener('japanflow:check-updates', onCheck);
  }, [refresh]);
  if (!currentUser || !isNativeAndroid() || !visible) return null;
  const close = () => {
    if (next?.mandatory) return;
    if (next) setDismissed(next.id);
    setVisible(false);
  };
  const download = async () => {
    if (!next?.downloadUrl) return;
    setError('');
    setReady(false);
    setProgress({ status: 'downloading', percent: 0, message: 'Preparando download' });
    try {
      await nativeUpdater.downloadApk({ url: next.downloadUrl });
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : 'Falha ao iniciar download');
    }
  };
  const install = async () => {
    try {
      await nativeUpdater.installApk();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível iniciar instalação');
    }
  };
  return (
    <div className="jf-update-backdrop" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Atualizações JapanFlow"
        className="jf-update-card"
      >
        <header className="jf-update-header">
          <div>
            <small>JAPANFLOW · ATUALIZAÇÕES</small>
            <h2>{next ? 'Uma nova versão está disponível' : 'Verificar atualizações'}</h2>
          </div>
          {!next?.mandatory && (
            <button aria-label="Fechar" onClick={close}>
              <X size={20} />
            </button>
          )}
        </header>
        <p className="jf-update-version">
          Instalada: <strong>{version || 'Consultando…'}</strong>
          {next && (
            <>
              {' '}
              · Nova: <strong>{next.version}</strong>
            </>
          )}
        </p>
        {next ? (
          <>
            <h3>{next.title}</h3>
            <p className="jf-update-notes">{next.notes}</p>
            {progress && (
              <div className="jf-update-progress" aria-live="polite">
                <div className="jf-update-track">
                  <span style={{ width: `${progress.percent}%` }} />
                </div>
                <span>
                  {progress.status === 'complete'
                    ? 'Download concluído'
                    : `Baixando ${progress.percent}%`}
                </span>
              </div>
            )}
            {ready ? (
              <button className="jf-update-primary" onClick={() => void install()}>
                <Download size={17} /> Instalar atualização
              </button>
            ) : (
              <button
                className="jf-update-primary"
                disabled={progress?.status === 'downloading'}
                onClick={() => void download()}
              >
                <ArrowDownToLine size={17} />{' '}
                {progress?.status === 'downloading' ? 'Baixando…' : 'Baixar no aplicativo'}
              </button>
            )}
            {next.mandatory && (
              <p className="jf-update-hint">
                Atualização obrigatória. A instalação precisa da confirmação do Android.
              </p>
            )}
          </>
        ) : (
          <p className="jf-update-notes">
            {checking
              ? 'Consultando versões…'
              : 'Você já está na versão mais recente do canal selecionado.'}
          </p>
        )}
        <label className="jf-update-beta">
          <input
            type="checkbox"
            checked={beta}
            onChange={(event) => {
              setBeta(event.target.checked);
              localStorage.setItem('japanflow.updates.beta', String(event.target.checked));
            }}
          />{' '}
          Receber versões Beta
        </label>
        {error && (
          <p className="jf-update-error" role="alert">
            {error}
          </p>
        )}
        {!next?.mandatory && (
          <button className="jf-update-secondary" onClick={close}>
            {next ? 'Mais tarde' : 'Fechar'}
          </button>
        )}
      </section>
    </div>
  );
}
