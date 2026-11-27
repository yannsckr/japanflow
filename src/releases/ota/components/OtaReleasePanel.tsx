import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Zap, Package } from 'lucide-react';
import { toast } from 'sonner';
import app from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { subscribeOtaReleases, type OtaRelease } from '../otaService';
import { uploadOtaDraft, type OtaDraftInput } from '../otaUpload';
import { validateOtaPackage } from '../otaPackageApi';
import { publishOtaRelease } from '../otaPublicationApi';
import { revokeOtaRelease } from '../otaRevocationApi';

type Mode = 'stable' | 'disabled';
type Control = { mode: Mode; configured: boolean };
const manageControl = httpsCallable<{ action: 'get' | 'set'; mode?: Mode }, Control>(
  getFunctions(app, 'southamerica-east1'),
  'japanflowManageOtaDistribution'
);
const initialForm: OtaDraftInput = {
  bundleVersion: '',
  title: '',
  notes: '',
  channel: 'stable',
  minNativeCode: 20,
  maxNativeCode: 20,
};

export default function OtaReleasePanel({ userId }: { userId: string }) {
  const [releases, setReleases] = useState<OtaRelease[]>([]);
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [control, setControl] = useState<Control | null>(null);
  const [controlError, setControlError] = useState('');
  const [phase, setPhase] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  useEffect(
    () =>
      subscribeOtaReleases(
        (items) => {
          setReleases(items);
          setLoading(false);
          setError('');
        },
        (reason) => {
          setError(reason.message);
          setLoading(false);
        }
      ),
    []
  );

  useEffect(() => {
    let disposed = false;
    void manageControl({ action: 'get' })
      .then(({ data }) => {
        if (!disposed) {
          setControl(data);
          setControlError('');
        }
      })
      .catch(() => {
        if (!disposed) setControlError('Controle OTA indisponivel.');
      });
    return () => {
      disposed = true;
    };
  }, []);

  async function run(action: () => Promise<void>) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setProgress(0);
    try {
      await action();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Falha na operacao OTA.');
    } finally {
      submitting.current = false;
      setBusy(false);
      setPhase('');
    }
  }

  async function refreshControl() {
    await run(async () => {
      try {
        const { data } = await manageControl({ action: 'get' });
        setControl(data);
        setControlError('');
      } catch (reason) {
        setControl(null);
        setControlError('Controle OTA indisponivel.');
        throw reason;
      }
    });
  }

  async function changeMode(mode: Mode) {
    if (
      !window.confirm(
        mode === 'stable'
          ? 'Ativar distribuicao para todos os motoboys compativeis?'
          : 'Pausar novas autorizacoes OTA?'
      )
    )
      return;
    await run(async () => {
      setPhase('Atualizando distribuicao...');
      try {
        const { data } = await manageControl({ action: 'set', mode });
        setControl(data);
        setControlError('');
        toast.success(mode === 'stable' ? 'Distribuicao Stable ativa.' : 'Distribuicao pausada.');
      } catch (reason) {
        setControl(null);
        setControlError('Estado da distribuicao nao confirmado.');
        throw reason;
      }
    });
  }

  async function validateAndPublish(draftId: string, expected?: OtaRelease) {
    setPhase('Validando pacote...');
    const validated = await validateOtaPackage(draftId);
    if (
      expected &&
      (validated.sha256 !== expected.sha256 || validated.sizeBytes !== expected.sizeBytes)
    )
      throw new Error('Pacote divergente');
    setPhase('Protegendo e assinando pacote...');
    await publishOtaRelease(draftId, []);
    toast.success('Atualizacao Stable publicada.');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !userId || !control || submitting.current) return;
    if (
      !window.confirm(
        control.mode === 'stable'
          ? 'Publicar atualizacao para todos os motoboys compativeis?'
          : 'Publicar atualizacao com distribuicao pausada?'
      )
    )
      return;
    await run(async () => {
      setPhase('Enviando pacote...');
      const draftId = await uploadOtaDraft(
        file,
        { ...form, channel: 'stable' },
        userId,
        setProgress
      );
      setForm(initialForm);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      try {
        await validateAndPublish(draftId);
      } catch (reason) {
        toast.info('Rascunho salvo. Consulte o historico antes de tentar novamente.');
        throw reason;
      }
    });
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Zap className="text-primary" size={23} />
          <div>
            <h2 className="font-semibold">JapanFlow Live Updates</h2>
            <p className="text-xs text-muted-foreground">
              Canal Stable - todos os motoboys compativeis.
            </p>
          </div>
        </div>
        <span className="rounded-md border px-3 py-1 text-xs" role="status">
          {control
            ? control.mode === 'stable'
              ? 'Distribuicao ativa'
              : 'Distribuicao pausada'
            : 'Estado nao confirmado'}
        </span>
      </header>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void refreshControl()}
        >
          Consultar estado
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || control?.mode === 'disabled'}
          onClick={() => void changeMode('disabled')}
        >
          Pausar distribuicao
        </Button>
        <Button
          type="button"
          disabled={busy || !control?.configured || control.mode === 'stable'}
          onClick={() => void changeMode('stable')}
        >
          Ativar Stable
        </Button>
        {controlError && (
          <p role="alert" className="text-xs text-destructive">
            {controlError}
          </p>
        )}
        {control && !control.configured && (
          <p className="text-xs text-destructive">
            Configure o Android App ID no documento de controle.
          </p>
        )}
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5">
        <h3 className="font-medium">Nova atualizacao Stable</h3>
        <fieldset disabled={busy} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              Versao do bundle
              <Input
                required
                placeholder="49.0.0"
                value={form.bundleVersion}
                onChange={(e) => setForm({ ...form, bundleVersion: e.target.value })}
              />
            </label>
            <label className="space-y-1 text-sm">
              Canal
              <Input value="Stable - todos" disabled />
            </label>
            <label className="space-y-1 text-sm">
              VersionCode minimo
              <Input
                type="number"
                min={20}
                required
                value={form.minNativeCode}
                onChange={(e) => setForm({ ...form, minNativeCode: Number(e.target.value) })}
              />
            </label>
            <label className="space-y-1 text-sm">
              VersionCode maximo
              <Input
                type="number"
                min={form.minNativeCode}
                required
                value={form.maxNativeCode}
                onChange={(e) => setForm({ ...form, maxNativeCode: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            Titulo
            <Input
              required
              maxLength={160}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="block space-y-1 text-sm">
            Notas da atualizacao
            <Textarea
              required
              maxLength={10000}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <label className="block space-y-2 rounded-lg border border-dashed p-5 text-sm">
            <Package size={22} className="text-muted-foreground" />
            Pacote ZIP - ate 100 MB
            <Input
              ref={fileInput}
              required
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </fieldset>
        {busy && (
          <div role="status" className="space-y-2">
            <p className="text-sm">{phase || 'Processando...'}</p>
            {phase === 'Enviando pacote...' && (
              <progress className="h-2 w-full" value={progress} max={100} />
            )}
          </div>
        )}
        <Button disabled={busy || !file || !userId || !control} type="submit">
          Validar e publicar atualizacao
        </Button>
      </form>
      <div className="space-y-3">
        <h3 className="font-semibold">Historico de atualizacoes</h3>
        {loading && <p role="status">Carregando pacotes...</p>}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {!loading && !error && releases.length === 0 && (
          <p className="rounded-lg border p-5 text-sm text-muted-foreground">
            Nenhum pacote cadastrado.
          </p>
        )}
        {releases.map((release) => (
          <article
            key={release.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
          >
            <div className="min-w-0 space-y-1">
              <p className="font-medium">{release.title}</p>
              <p className="text-xs text-muted-foreground">
                {release.bundleVersion} / {release.channel} / Android {release.minNativeCode} -{' '}
                {release.maxNativeCode}
              </p>
              <p className="break-all font-mono text-xs text-muted-foreground">
                SHA-256: {release.sha256}
              </p>
            </div>
            {release.status === 'draft' &&
              release.channel === 'stable' &&
              release.minNativeCode >= 20 && (
                <Button
                  type="button"
                  disabled={busy || !control}
                  onClick={() => {
                    if (window.confirm('Validar e publicar este rascunho Stable?'))
                      void run(() => validateAndPublish(release.id, release));
                  }}
                >
                  Validar e publicar
                </Button>
              )}
            {release.status === 'published' && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Revogar esta release? Isso bloqueia novas entregas, mas nao reverte instalacoes existentes.'
                    )
                  )
                    void run(async () => {
                      await revokeOtaRelease(release.id);
                      toast.success('Release revogada.');
                    });
                }}
              >
                Revogar release
              </Button>
            )}
            <span className="rounded-md border px-3 py-1 text-xs">
              {release.status === 'draft'
                ? 'Rascunho'
                : release.status === 'published'
                  ? 'Publicada'
                  : 'Revogada'}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
