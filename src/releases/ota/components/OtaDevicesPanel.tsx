import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MonitorSmartphone } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { otaDevices, type OtaDevice } from '../otaDevicesApi';
import { subscribeOtaReleases, type OtaRelease } from '../otaService';
import { compareBundleVersions } from '../otaReleaseSelector';

export default function OtaDevicesPanel() {
  const { users } = useApp();
  const [devices, setDevices] = useState<OtaDevice[]>([]);
  const [releases, setReleases] = useState<OtaRelease[]>([]);
  const [releaseError, setReleaseError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(
    () =>
      subscribeOtaReleases(
        (items) => {
          setReleases(items);
          setReleaseError(false);
        },
        () => setReleaseError(true)
      ),
    []
  );
  useEffect(() => {
    let disposed = false;
    let busy = false;
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const { data } = await otaDevices({ action: 'list' });
        if (!disposed) {
          setDevices(data.devices || []);
          setError('');
        }
      } catch (e) {
        if (!disposed)
          setError(e instanceof Error ? e.message : 'Falha ao consultar dispositivos.');
      } finally {
        busy = false;
        if (!disposed) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [refresh]);
  const latest = (d: OtaDevice) =>
    releases
      .filter(
        (r) =>
          r.channel === 'stable' &&
          r.status === 'published' &&
          r.minNativeCode <= d.nativeCode &&
          r.maxNativeCode >= d.nativeCode
      )
      .sort((a, b) => compareBundleVersions(b.bundleVersion, a.bundleVersion))[0];
  return (
    <section className="space-y-4 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MonitorSmartphone size={22} />
          <div>
            <h2 className="font-semibold">Dispositivos</h2>
            <p className="text-xs text-muted-foreground">
              Versoes informadas pelos aplicativos. Ultima comunicacao, nao presenca em tempo real.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setRefresh((v) => v + 1)}>
          Atualizar
        </Button>
      </div>
      {loading && <p role="status">Consultando dispositivos...</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {releaseError && (
        <p className="text-xs text-muted-foreground">
          Nao foi possivel consultar a versao OTA de referencia.
        </p>
      )}
      {!loading && !error && !devices.length && (
        <p className="rounded-lg border p-4 text-sm">
          Nenhum dispositivo informou sua versao ainda. A coleta comeca apos a instalacao do bundle
          49.0.2 e login no aplicativo.
        </p>
      )}
      {devices.map((d) => {
        const target = latest(d);
        const status =
          releaseError || !target
            ? 'Sem referencia'
            : d.bundleVersion === target.bundleVersion
              ? 'Atualizado'
              : 'Versao diferente';
        return (
          <article
            key={d.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
          >
            <div>
              <strong>{users.find((u) => u.id === d.userId)?.name || d.userId}</strong>
              <p className="text-xs text-muted-foreground">
                Android {d.nativeVersion} / Build {d.nativeCode} / OTA{' '}
                {d.bundleVersion === 'builtin' ? 'Original do APK' : d.bundleVersion}
              </p>
              <p className="text-xs text-muted-foreground">
                Ultima comunicacao:{' '}
                {d.lastSeen
                  ? new Date(d.lastSeen).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                  : 'Indisponivel'}
              </p>
            </div>
            <span className="rounded-md border px-2 py-1 text-xs">{status}</span>
          </article>
        );
      })}
    </section>
  );
}
