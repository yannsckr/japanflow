import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Zap, Package, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { subscribeOtaReleases, type OtaRelease } from '../otaService';
import { uploadOtaDraft, type OtaDraftInput } from '../otaUpload';

const initialForm: OtaDraftInput = {
  bundleVersion: '',
  title: '',
  notes: '',
  channel: 'beta',
  minNativeCode: 18,
  maxNativeCode: 18,
};

export default function OtaReleasePanel({ userId }: { userId: string }) {
  const [releases, setReleases] = useState<OtaRelease[]>([]);
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  useEffect(() => {
    return subscribeOtaReleases(
      (items) => {
        setReleases(items);
        setLoading(false);
        setError('');
      },
      (reason) => {
        setError(reason.message);
        setLoading(false);
      }
    );
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file || !userId || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setProgress(0);

    try {
      await uploadOtaDraft(file, form, userId, setProgress);
      toast.success('Rascunho OTA criado com sucesso.');
      setForm(initialForm);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Falha ao preparar pacote OTA.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Zap className="text-primary" size={23} />
          <div>
            <h2 className="font-semibold">JapanFlow Live Updates</h2>
            <p className="text-xs text-muted-foreground">
              Pacotes de atualizacao do frontend Android.
            </p>
          </div>
        </div>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock size={14} /> Distribuicao bloqueada
        </span>
      </header>

      <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5">
        <h3 className="font-medium">Novo pacote OTA</h3>
        <fieldset disabled={busy} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              Versao do bundle
              <Input
                required
                placeholder="48.0.1"
                value={form.bundleVersion}
                onChange={(e) => setForm({ ...form, bundleVersion: e.target.value })}
              />
            </label>
            <label className="space-y-1 text-sm">
              Canal
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={form.channel}
                onChange={(e) =>
                  setForm({
                    ...form,
                    channel: e.target.value === 'stable' ? 'stable' : 'beta',
                  })
                }
              >
                <option value="beta">Beta</option>
                <option value="stable">Estavel</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              VersionCode minimo
              <Input
                type="number"
                min={18}
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
          <div className="space-y-2" role="status">
            <p className="text-sm">Preparando pacote: {progress}%</p>
            <progress className="h-2 w-full" value={progress} max={100} />
          </div>
        )}

        <Button disabled={busy || !file || !userId} type="submit">
          {busy ? 'Processando...' : 'Salvar rascunho'}
        </Button>
      </form>

      <div className="space-y-3">
        <h3 className="font-semibold">Pacotes cadastrados</h3>
        {loading && <p role="status">Carregando pacotes...</p>}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {!loading && !error && releases.length === 0 && (
          <p className="rounded-lg border p-5 text-sm text-muted-foreground">
            Nenhum pacote OTA cadastrado.
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
                {release.bundleVersion} / {release.channel} / Android
              </p>
              <p className="text-xs text-muted-foreground">
                Native {release.minNativeCode} - {release.maxNativeCode}
              </p>
              <p className="break-all font-mono text-xs text-muted-foreground">
                SHA-256: {release.sha256}
              </p>
            </div>
            <span className="rounded-md border px-3 py-1 text-xs">
              {release.status === 'draft' ? 'Rascunho' : release.status}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
