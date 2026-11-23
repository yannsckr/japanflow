import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  CirclePlus,
  Filter,
  IdCard,
  MapPin,
  Pencil,
  Phone,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import ClientEditorDialog, { type ClientForm } from './ClientEditorDialog';
import type { DepartmentalClient } from '@/hooks/useDepartmental';

export default function ClientsWorkspace({
  dept,
  canManage,
  canDelete,
}: {
  dept: {
    clients: DepartmentalClient[];
    clientsError: string | null;
    addClient: (data: ClientForm) => Promise<void>;
    updateClient: (id: string, data: ClientForm) => Promise<void>;
    deleteClient: (id: string) => Promise<void>;
  };
  canManage: boolean;
  canDelete: boolean;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pf' | 'pj'>('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const clients = useMemo(() => dept.clients ?? [], [dept.clients]);
  const editingClient = clients.find((item) => item.id === editing);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    return clients.filter((client) => {
      const type = client.clientType || 'pj';
      return (
        (filter === 'all' || filter === type) &&
        (!q ||
          [client.companyName, client.contactPerson, client.phone, client.address].some((field) =>
            (field || '').toLocaleLowerCase('pt-BR').includes(q)
          ))
      );
    });
  }, [clients, filter, query]);

  const save = async (form: ClientForm) => {
    if (editing) await dept.updateClient(editing, form);
    else await dept.addClient(form);
    toast.success(editing ? 'Cliente atualizado.' : 'Cliente cadastrado.');
    setEditing(null);
  };

  return (
    <section
      className="min-w-0"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'stretch' }}
    >
      <Card className="jf-clients-shell min-w-0 border-border/70 shadow-sm">
        <CardContent className="!p-3 sm:!p-4" style={{ padding: 16 }}>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UsersRound className="h-5 w-5" />
              </span>
              <div className="flex min-w-0 flex-col justify-center gap-1">
                <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
                  <h2 className="!m-0 !p-0 text-lg font-semibold leading-6 tracking-tight text-foreground">
                    Clientes
                  </h2>
                  <span className="inline-flex h-5 items-center rounded-full border border-primary/20 bg-primary/10 px-2 text-[10px] font-medium leading-none text-primary">
                    Centralizado
                  </span>
                </div>
                <p className="!m-0 !p-0 text-xs leading-4 text-muted-foreground">
                  Cadastro centralizado para tarefas, entregas e operação.
                </p>
              </div>
            </div>
            {canManage && (
              <Button
                size="sm"
                className="h-9 shrink-0 self-start gap-1.5 px-3 sm:self-center"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <CirclePlus className="h-4 w-4 shrink-0" /> Novo cliente
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="jf-clients-shell min-w-0 border-border/70 shadow-sm">
        <CardContent
          className="!p-3 sm:!p-4"
          style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}
        >
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-h-7 min-w-0 items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-primary" />
              <h3 className="!m-0 !p-0 text-sm font-semibold leading-5 text-foreground">
                Base de clientes
              </h3>
              <span className="text-xs leading-5 text-muted-foreground">({filtered.length})</span>
            </div>
            <span className="inline-flex h-7 w-fit items-center gap-1 rounded-full border border-border bg-muted/40 px-2 text-[11px] leading-none text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" /> Todos os usuários podem
              cadastrar
            </span>
          </div>

          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_210px]">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar clientes"
                className="!h-9 w-full !pl-9 text-sm"
                placeholder="Pesquisar nome, responsável, telefone ou endereço"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <Filter className="h-4 w-4 shrink-0 text-primary" />
              <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                <SelectTrigger
                  aria-label="Filtrar tipo de cliente"
                  className="!h-9 w-full min-w-0 text-sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="pf">Pessoa física</SelectItem>
                  <SelectItem value="pj">Pessoa jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {dept.clientsError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {dept.clientsError}
            </p>
          )}

          {!dept.clientsError && filtered.length === 0 && (
            <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
              Nenhum cliente corresponde aos filtros.
            </div>
          )}

          {!dept.clientsError && (
            <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filtered.map((client) => {
                const isPF = (client.clientType || 'pj') === 'pf';
                const Icon = isPF ? UserRound : Building2;
                return (
                  <article
                    key={client.id}
                    className="min-w-0 rounded-xl border border-border/70 bg-card p-3 transition-colors hover:border-primary/40 hover:shadow-sm"
                  >
                    <div className="flex min-h-9 items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="rounded-lg bg-primary/10 p-2 text-primary">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p
                            className="!m-0 truncate text-sm font-semibold leading-5"
                            title={client.companyName}
                          >
                            {client.companyName}
                          </p>
                          <p className="!m-0 text-[11px] leading-4 text-muted-foreground">
                            {isPF ? 'Pessoa física' : 'Pessoa jurídica'}
                          </p>
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            aria-label={`Editar ${client.companyName}`}
                            onClick={() => {
                              setEditing(client.id);
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {canDelete && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              disabled={deletingId === client.id}
                              aria-label={`Excluir ${client.companyName}`}
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    `Excluir ${client.companyName}? A exclusão não altera tarefas anteriores.`
                                  )
                                )
                                  return;
                                setDeletingId(client.id);
                                try {
                                  await dept.deleteClient(client.id);
                                  toast.success('Cliente excluído.');
                                } catch {
                                  toast.error('Erro ao excluir cliente.');
                                } finally {
                                  setDeletingId(null);
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    <div
                      className="text-xs text-muted-foreground"
                      style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}
                    >
                      <p className="!m-0 flex items-center gap-2 truncate">
                        <IdCard className="h-3.5 w-3.5 shrink-0 text-primary/80" />
                        {client.contactPerson}
                      </p>
                      <p className="!m-0 flex items-center gap-2 truncate">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-primary/80" />
                        {client.phone}
                      </p>
                      <p className="!m-0 flex items-start gap-2">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" />
                        <span className="line-clamp-2" title={client.address}>
                          {client.address}
                        </span>
                      </p>
                      <p className="!m-0 flex items-center gap-2 font-medium text-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                        {client.distanceFromStoreMeters == null
                          ? 'Distância rodoviária ainda não calculada'
                          : `${(client.distanceFromStoreMeters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km da loja (via ruas)`}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ClientEditorDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
        initial={editingClient || null}
        onSave={save}
      />
    </section>
  );
}
