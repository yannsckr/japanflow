import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { addDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  ArrowDownToLine,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Plus,
  Rocket,
  ShieldAlert,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  releasesCollection,
  subscribeCosmosReleases,
  validHttpsUrl,
  type CosmosRelease,
} from '@/cosmos/releases/releaseService';

const empty = {
  version: '',
  title: '',
  notes: '',
  channel: 'stable' as 'stable' | 'beta',
  downloadUrl: '',
  mandatory: false,
};
export default function CosmosReleasesPage() {
  const { authenticatedUser } = useApp();
  const username = authenticatedUser?.username?.trim().toLowerCase() || '';
  const canPublish = ['ryan', 'japan-ti'].includes(username); // IMPORTANTE: duplicar autorizacao nas regras Firestore.
  const [releases, setReleases] = useState<CosmosRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'stable' | 'beta'>('all');
  useEffect(() => {
    if (!canPublish) return;
    return subscribeCosmosReleases(
      (items) => {
        setReleases(items);
        setLoading(false);
      },
      (e) => {
        setLoading(false);
        toast.error('Falha ao carregar releases: ' + e.message);
      }
    );
  }, [canPublish]);
  const visible = useMemo(
    () => releases.filter((r) => filter === 'all' || r.channel === filter),
    [releases, filter]
  );
  if (!canPublish)
    return (
      <main className="p-8">
        <h1 className="text-xl font-semibold">Acesso restrito à TI</h1>
        <p className="text-muted-foreground">
          Publicação de releases disponível apenas à equipe autorizada.
        </p>
      </main>
    );
  const publish = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(form.version))
      return toast.error('Use versão no formato 1.2.3');
    if (!form.title.trim() || !form.notes.trim())
      return toast.error('Informe título e notas da versão');
    if (!validHttpsUrl(form.downloadUrl)) return toast.error('O download precisa usar HTTPS');
    if (releases.some((r) => r.version === form.version && r.channel === form.channel))
      return toast.error('Essa versão já existe nesse canal');
    setSaving(true);
    try {
      await addDoc(releasesCollection(), {
        ...form,
        title: form.title.trim(),
        notes: form.notes.trim(),
        downloadUrl: form.downloadUrl.trim(),
        status: 'published',
        createdBy: authenticatedUser?.id || username,
        createdAt: serverTimestamp(),
        publishedAt: serverTimestamp(),
      });
      toast.success('Release publicado');
      setShowForm(false);
      setForm(empty);
    } catch (e) {
      toast.error('Não foi possível publicar. Verifique permissões do Firebase.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };
  const toggleMandatory = async (r: CosmosRelease) => {
    try {
      await updateDoc(doc(db, 'cosmos_releases', r.id), { mandatory: !r.mandatory });
    } catch {
      toast.error('Não foi possível alterar o release');
    }
  };
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-7 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[.15em] text-muted-foreground">
            <GitBranch size={15} /> TI / COSMOS
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Releases</h1>
          <p className="text-sm text-muted-foreground">
            Histórico de versões, notas de lançamento e distribuição do COSMOS Android.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus size={16} className="mr-2" />
          {showForm ? 'Fechar editor' : 'Nova release'}
        </Button>
      </header>
      {showForm && (
        <form onSubmit={publish} className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          <div>
            <h2 className="font-semibold">Publicar versão</h2>
            <p className="text-xs text-muted-foreground">
              O aplicativo exibirá automaticamente releases publicadas no canal estável.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              Versão
              <Input
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                placeholder="1.2.0"
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              Canal
              <select
                className="flex h-10 w-full rounded-md border bg-background px-3"
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value as 'stable' | 'beta' })}
              >
                <option value="stable">Estável</option>
                <option value="beta">Beta</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            Título
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Melhorias de GPS e chat"
              required
            />
          </label>
          <label className="block space-y-1 text-sm">
            Changelog
            <Textarea
              rows={7}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={'## Novidades\n- ...\n\n## Correções\n- ...'}
              required
            />
          </label>
          <label className="block space-y-1 text-sm">
            URL HTTPS do APK assinado (opcional)
            <Input
              value={form.downloadUrl}
              onChange={(e) => setForm({ ...form, downloadUrl: e.target.value })}
              placeholder="https://.../cosmos.apk"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.mandatory}
              onChange={(e) => setForm({ ...form, mandatory: e.target.checked })}
            />{' '}
            Atualização obrigatória (bloqueia adiamento no app)
          </label>
          <p className="text-xs text-muted-foreground">
            O endereço do APK deve vir de uma distribuição controlada e corresponder à versão
            assinada. Não inclua links de build de depuração.
          </p>
          <Button disabled={saving} type="submit">
            <Rocket size={16} className="mr-2" />
            {saving ? 'Publicando...' : 'Publicar release'}
          </Button>
        </form>
      )}
      <div className="flex gap-2 border-b pb-3">
        {(['all', 'stable', 'beta'] as const).map((v) => (
          <Button
            key={v}
            variant={filter === v ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilter(v)}
          >
            {v === 'all' ? 'Todas' : v === 'stable' ? 'Estáveis' : 'Beta'}
          </Button>
        ))}
      </div>
      {loading && !releases.length ? (
        <p className="text-sm text-muted-foreground">Carregando versões...</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          Nenhuma release publicada neste canal.
        </div>
      ) : (
        <section className="space-y-5">
          {visible.map((r, i) => (
            <article key={r.id} className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
              <aside className="pt-4 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Tag size={15} />
                  {r.version}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {r.publishedAt?.toDate
                    ? r.publishedAt.toDate().toLocaleDateString('pt-BR')
                    : 'Data pendente'}
                </p>
                {i === 0 && (
                  <span className="mt-2 inline-block rounded-full border px-2 py-1 text-xs">
                    Mais recente
                  </span>
                )}
              </aside>
              <div className="rounded-2xl border bg-card shadow-sm">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
                  <h2 className="text-lg font-semibold">{r.title}</h2>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border px-2 py-1">
                      {r.channel === 'stable' ? 'Estável' : 'Beta'}
                    </span>
                    {r.mandatory && (
                      <span className="flex items-center gap-1 rounded-full border px-2 py-1">
                        <ShieldAlert size={12} /> Obrigatória
                      </span>
                    )}
                  </div>
                </header>
                <div className="whitespace-pre-wrap break-words px-5 py-5 text-sm leading-7">
                  {r.notes}
                </div>
                <footer className="flex flex-wrap gap-3 border-t px-5 py-4">
                  {r.downloadUrl && (
                    <a
                      href={r.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4"
                    >
                      <ArrowDownToLine size={15} /> Baixar APK <ExternalLink size={13} />
                    </a>
                  )}
                  <button
                    className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => void toggleMandatory(r)}
                  >
                    <CheckCircle2 size={14} />
                    {r.mandatory ? 'Tornar opcional' : 'Marcar obrigatória'}
                  </button>
                </footer>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
