import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Bike,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Cog,
  ExternalLink,
  ListOrdered,
  MapPin,
  Navigation,
  Package2,
  Route,
  Truck,
  UserPlus,
} from 'lucide-react';
import RoutePlanner from '@/components/motoboy/RoutePlanner';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { MotoboyAssignment } from '@/hooks/useDepartmental';

type UserLike = {
  id: string;
  name?: string;
  sectors?: string[];
  role?: string;
};

type Session = {
  userId: string;
  phase: 'delivering' | 'returning';
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  updatedAt: number;
};

type Props = {
  currentUser: UserLike;
  users: UserLike[];
  dept: any;
  canManageMotoboy: boolean;
  isAdmin: boolean;
  userSectors: string[];
};

function statusLabel(status: string) {
  switch (status) {
    case 'completed':
      return 'Concluída';
    case 'accepted':
      return 'Em andamento';
    case 'pending_approval':
      return 'Aguardando aprovação';
    case 'pending':
    default:
      return 'Pendente';
  }
}

function statusClass(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300';
    case 'accepted':
      return 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300';
    case 'pending_approval':
      return 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300';
    default:
      return 'bg-primary/10 text-primary border-primary/20';
  }
}

function kpiCard(title: string, value: string | number, icon: React.ElementType, tone?: string) {
  const Icon = icon;
  return (
    <Card className="overflow-hidden border-border/70">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div
          className={cn(
            'rounded-xl border p-2.5',
            tone || 'border-primary/20 bg-primary/10 text-primary'
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function MotoboysWorkspace({ currentUser, users, dept, canManageMotoboy }: Props) {
  const motoboys = useMemo(
    () => users.filter((u) => Array.isArray(u.sectors) && u.sectors.includes('motoboys')),
    [users]
  );

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedMotoboy, setSelectedMotoboy] = useState<string>('');
  const [searchUnassigned, setSearchUnassigned] = useState('');
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [mapStyle, setMapStyle] = useState<'roadmap' | 'satellite'>('roadmap');

  useEffect(() => {
    if (!selectedMotoboy && motoboys.length > 0) {
      setSelectedMotoboy(motoboys[0].id);
    }
  }, [motoboys, selectedMotoboy]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'motoboy_live_sessions'), (snapshot) => {
      setSessions(
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            userId: String(data.user_id || docSnap.id),
            phase: data.phase === 'returning' ? 'returning' : 'delivering',
            lat: typeof data.lat === 'number' ? data.lat : null,
            lng: typeof data.lng === 'number' ? data.lng : null,
            accuracy: typeof data.accuracy === 'number' ? data.accuracy : null,
            updatedAt: data.updated_at?.toMillis?.() || 0,
          };
        })
      );
    });
    return unsub;
  }, []);

  const allAssignments: MotoboyAssignment[] = Array.isArray(dept?.motoboyAssignments)
    ? dept.motoboyAssignments
    : [];

  const dateFiltered = useMemo(() => {
    return allAssignments.filter((item) => {
      const baseDate = (item.scheduledFor || item.createdAt || '').split('T')[0];
      return !selectedDate || baseDate === selectedDate;
    });
  }, [allAssignments, selectedDate]);

  const selectedAssignments = useMemo(
    () => dateFiltered.filter((item) => item.assignedTo === selectedMotoboy),
    [dateFiltered, selectedMotoboy]
  );

  const unassigned = useMemo(() => {
    const q = searchUnassigned.trim().toLowerCase();
    return dateFiltered.filter((item) => {
      if (item.assignedTo !== null || item.status === 'pending_approval') return false;
      if (!q) return true;
      return [item.clientName, item.location, item.description].join(' ').toLowerCase().includes(q);
    });
  }, [dateFiltered, searchUnassigned]);

  const selectedName = motoboys.find((m) => m.id === selectedMotoboy)?.name || 'Motoboy';
  const selectedSession = sessions.find((s) => s.userId === selectedMotoboy);
  const validMap =
    selectedSession &&
    selectedSession.lat !== null &&
    selectedSession.lng !== null &&
    Number.isFinite(selectedSession.lat) &&
    Number.isFinite(selectedSession.lng);
  const mapSrc = validMap
    ? `https://maps.google.com/maps?q=${encodeURIComponent(`${selectedSession!.lat},${selectedSession!.lng}`)}&z=15&t=${mapStyle === 'satellite' ? 'k' : 'm'}&output=embed`
    : '';

  const completedCount = selectedAssignments.filter((a) => a.status === 'completed').length;
  const acceptedCount = selectedAssignments.filter((a) => a.status === 'accepted').length;
  const pendingCount = selectedAssignments.filter((a) => a.status === 'pending').length;

  const handleAssignToSelected = async (rideId: string) => {
    if (!selectedMotoboy) {
      toast.error('Selecione um motoboy antes de designar a corrida.');
      return;
    }
    await dept.updateMotoboyAssignment(rideId, { assignedTo: selectedMotoboy });
    toast.success('Corrida designada ao motoboy selecionado.');
  };

  return (
    <section className="space-y-4">
      <Card className="border-border/70">
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Bike className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/80">
                  Departamental / Operação
                </p>
                <h2 className="text-2xl font-semibold tracking-tight">Motoboys</h2>
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Planejamento, designação e acompanhamento da jornada do motoboy selecionado.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <div className="relative min-w-[160px]">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedMotoboy} onValueChange={setSelectedMotoboy}>
              <SelectTrigger className="min-w-[220px]">
                <SelectValue placeholder="Selecione o motoboy" />
              </SelectTrigger>
              <SelectContent>
                {motoboys.map((motoboy) => (
                  <SelectItem key={motoboy.id} value={motoboy.id}>
                    {motoboy.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}>
              <Cog className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
        {kpiCard('Corridas do dia', selectedAssignments.length, Package2)}
        {kpiCard(
          'Concluídas',
          completedCount,
          CheckCircle2,
          'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
        )}
        {kpiCard(
          'Em andamento',
          acceptedCount,
          Navigation,
          'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300'
        )}
        {kpiCard('Pendentes', pendingCount, Clock3, 'border-primary/20 bg-primary/10 text-primary')}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Route className="h-4 w-4 text-primary" /> Planejamento de rota
              </CardTitle>
              <CardDescription>
                Abra o planejador existente para montar e otimizar a rota do dia.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm text-muted-foreground">
                <p>
                  Motoboy selecionado: <strong className="text-foreground">{selectedName}</strong>
                </p>
                <p className="mt-1">
                  Data operacional: {selectedDate.split('-').reverse().join('/')}
                </p>
              </div>
              <Button className="w-full" onClick={() => setPlannerOpen(true)}>
                <Route className="mr-2 h-4 w-4" /> Abrir planejador
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListOrdered className="h-4 w-4 text-primary" /> Corridas sem designação
                <Badge variant="outline" className="ml-auto">
                  {unassigned.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Buscar cliente ou local"
                value={searchUnassigned}
                onChange={(e) => setSearchUnassigned(e.target.value)}
              />
              <div className="space-y-2">
                {unassigned.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    Nenhuma corrida sem designação nesta data.
                  </div>
                ) : (
                  unassigned.slice(0, 8).map((ride) => (
                    <div key={ride.id} className="rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {ride.clientName || ride.description}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                            {ride.location || ride.description}
                          </p>
                        </div>
                        {canManageMotoboy && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAssignToSelected(ride.id)}
                          >
                            <UserPlus className="mr-1 h-3.5 w-3.5" /> Designar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4 text-primary" /> Mapa operacional
                </CardTitle>
                <CardDescription>
                  Exibe somente a posição do motoboy selecionado, sem incorporar a página antiga.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={mapStyle === 'roadmap' ? 'default' : 'outline'}
                  onClick={() => setMapStyle('roadmap')}
                >
                  Mapa
                </Button>
                <Button
                  size="sm"
                  variant={mapStyle === 'satellite' ? 'default' : 'outline'}
                  onClick={() => setMapStyle('satellite')}
                >
                  Satélite
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-hidden rounded-2xl border bg-muted/20">
              {validMap ? (
                <iframe
                  title={`Mapa operacional de ${selectedName}`}
                  src={mapSrc}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-[360px] w-full border-0 lg:h-[430px]"
                />
              ) : (
                <div className="flex h-[360px] flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground lg:h-[430px]">
                  <MapPin className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Nenhuma posição válida disponível
                    </p>
                    <p className="mt-1 text-xs">
                      O motoboy ainda não enviou coordenadas nesta jornada ou o GPS está
                      indisponível.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Motoboy</p>
                <p className="mt-1 font-medium">{selectedName}</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Situação</p>
                <p className="mt-1 font-medium">
                  {selectedSession?.phase === 'returning'
                    ? 'Retornando à loja'
                    : selectedSession
                      ? 'Em entregas'
                      : 'Sem jornada ativa'}
                </p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Última atualização</p>
                <p className="mt-1 font-medium">
                  {selectedSession?.updatedAt
                    ? new Date(selectedSession.updatedAt).toLocaleString('pt-BR')
                    : 'Sem atualização'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-4 w-4 text-primary" /> Jornada do dia — {selectedName}
              </CardTitle>
              <CardDescription>
                Visualização simplificada das corridas do motoboy selecionado.
              </CardDescription>
            </div>
            <Badge className="border-primary/20 bg-primary/10 text-primary hover:bg-primary/10">
              {selectedAssignments.length} corrida(s)
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {selectedAssignments.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              Nenhuma corrida atribuída para o motoboy selecionado nesta data.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Cliente</th>
                    <th className="px-3 py-3 font-medium">Início</th>
                    <th className="px-3 py-3 font-medium">Km</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedAssignments.map((ride) => (
                    <tr key={ride.id} className="border-b last:border-b-0">
                      <td className="px-3 py-3">
                        <div className="font-medium">
                          {ride.clientName || 'Cliente não informado'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {ride.location || ride.description}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {new Date(ride.acceptedAt || ride.createdAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">—</td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2 py-1 text-xs font-medium',
                            statusClass(ride.status)
                          )}
                        >
                          {statusLabel(ride.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          {ride.status === 'pending' && canManageMotoboy && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => dept.updateMotoboyStatus(ride.id, 'accepted')}
                            >
                              Iniciar
                            </Button>
                          )}
                          {canManageMotoboy && ride.assignedTo && ride.status !== 'completed' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => dept.unassignMotoboy(ride.id)}
                            >
                              Desatribuir
                            </Button>
                          )}
                          {ride.proofUrl ? (
                            <Button size="sm" variant="outline" asChild>
                              <a href={ride.proofUrl} target="_blank" rel="noreferrer">
                                <ExternalLink className="mr-1 h-3.5 w-3.5" /> Notinha
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={plannerOpen} onOpenChange={setPlannerOpen}>
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Planejamento de rota</DialogTitle>
            <DialogDescription>
              Planejador existente reaproveitado dentro da nova interface de Motoboys.
            </DialogDescription>
          </DialogHeader>
          <RoutePlanner assignments={allAssignments} motoboys={motoboys as any} />
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurações de Motoboys</DialogTitle>
            <DialogDescription>
              Ponto inicial para ajustes da operação. Podemos expandir essas opções no próximo
              patch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border p-3">
              <p className="font-medium">Tema da aba</p>
              <p className="mt-1 text-muted-foreground">
                Esta área agora herda automaticamente o tema global do JapanFlow, sem forçar modo
                escuro.
              </p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="font-medium">Mapa operacional</p>
              <p className="mt-1 text-muted-foreground">
                O mapa embutido exibe apenas a posição do motoboy selecionado. A antiga página
                separada sai do fluxo principal.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
