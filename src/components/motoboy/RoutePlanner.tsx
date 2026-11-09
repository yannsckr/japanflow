import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '@/lib/firebase';
import type { MotoboyAssignment } from '@/hooks/useDepartmental';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, LocateFixed, MapPin, Route, Search } from 'lucide-react';

const functions = getFunctions(app, 'southamerica-east1');
const call = httpsCallable<Record<string, unknown>, any>(functions, 'googleRoutePlanner');
const STORE =
  'Japan Imports — Av. das Rosas, 111, Jardim Motorama, São José dos Campos, SP, 12224-000';
type Stop = {
  assignmentId: string;
  label: string;
  query: string;
  placeId: string;
  address: string;
};
type Suggestion = { placeId: string; label: string };
function AddressPicker({ stop, onSelect }: { stop: Stop; onSelect: (s: Stop) => void }) {
  const [query, setQuery] = useState(stop.address || stop.query);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const session = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
  );
  useEffect(() => {
    setQuery(stop.address || stop.query);
  }, [stop.assignmentId, stop.address, stop.query]);
  useEffect(() => {
    if (query.trim().length < 3 || query === stop.address) {
      setSuggestions([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await call({
          action: 'autocomplete',
          input: query,
          sessionToken: session.current,
        });
        if (active) setSuggestions(response.data.suggestions || []);
      } catch {
        if (active) setSuggestions([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, stop.address]);
  const choose = async (suggestion: Suggestion) => {
    setLoading(true);
    try {
      const response = await call({
        action: 'details',
        placeId: suggestion.placeId,
        sessionToken: session.current,
      });
      const address = String(response.data.formattedAddress || suggestion.label);
      onSelect({ ...stop, query: address, address, placeId: suggestion.placeId });
      setQuery(address);
      setSuggestions([]);
      session.current =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
    } catch (error) {
      toast.error('Não foi possível confirmar o endereço.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="relative min-w-0 flex-1">
      <div className="relative">
        <Search size={15} className="absolute left-2.5 top-3 text-muted-foreground" />
        <Input
          aria-label={`Endereço de ${stop.label}`}
          value={query}
          className="pl-8"
          placeholder="Digite rua, número, CEP ou local"
          onChange={(e) => {
            setQuery(e.target.value);
            onSelect({ ...stop, query: e.target.value, address: '', placeId: '' });
          }}
        />
      </div>
      {loading && <small className="text-muted-foreground">Consultando Google…</small>}
      {stop.placeId && <small className="text-green-700">Endereço confirmado</small>}
      {suggestions.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-lg border bg-popover shadow-xl"
          role="listbox"
        >
          {suggestions.map((s) => (
            <button
              type="button"
              key={s.placeId}
              className="block w-full border-b px-3 py-2 text-left text-xs hover:bg-muted"
              onClick={() => choose(s)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export default function RoutePlanner({
  assignments,
  motoboys,
}: {
  assignments: MotoboyAssignment[];
  motoboys: Array<{ id: string; name: string }>;
}) {
  const [motoboyId, setMotoboyId] = useState('');
  const [selected, setSelected] = useState<Stop[]>([]);
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState('');
  const eligible = useMemo(
    () => assignments.filter((a) => a.assignedTo === motoboyId && a.status === 'pending'),
    [assignments, motoboyId]
  );
  useEffect(() => {
    setSelected([]);
    setEstimate('');
  }, [motoboyId]);
  const toggle = useCallback(
    (a: MotoboyAssignment) =>
      setSelected((prev) => {
        if (prev.some((s) => s.assignmentId === a.id))
          return prev.filter((s) => s.assignmentId !== a.id);
        if (prev.length >= 20) {
          toast.error('O limite desta versão é de 20 entregas por rota.');
          return prev;
        }
        return [
          ...prev,
          {
            assignmentId: a.id,
            label: a.clientName || a.description || 'Corrida',
            query: a.location || '',
            placeId: '',
            address: '',
          },
        ];
      }),
    []
  );
  const change = (index: number, stop: Stop) =>
    setSelected((prev) => prev.map((s, i) => (i === index ? stop : s)));
  const move = (index: number, delta: number) =>
    setSelected((prev) => {
      const next = [...prev],
        target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const valid = selected.length > 0 && selected.every((s) => s.placeId && s.address);
  const optimize = async () => {
    const originPlaceId = import.meta.env.VITE_GOOGLE_STORE_PLACE_ID;
    if (!originPlaceId) {
      toast.error('Configure VITE_GOOGLE_STORE_PLACE_ID da loja antes de otimizar.');
      return;
    }
    setBusy(true);
    try {
      const result = await call({
        action: 'optimize',
        originPlaceId,
        destinations: selected.map((s) => s.placeId),
      });
      const order = result.data.order as number[];
      if (order.length !== selected.length || new Set(order).size !== selected.length)
        throw new Error('Ordem inválida');
      setSelected((prev) => order.map((i) => prev[i]));
      setEstimate(
        `Distância calculada: ${(Number(result.data.distanceMeters) / 1000).toFixed(1)} km (inclui retorno à loja)`
      );
      toast.success('Ordem sugerida pelo Google aplicada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível otimizar a rota');
    } finally {
      setBusy(false);
    }
  };
  const assign = async () => {
    if (!valid || !motoboyId) return;
    setBusy(true);
    try {
      await call({
        action: 'assign',
        motoboyId,
        stops: selected.map((s) => ({
          assignmentId: s.assignmentId,
          placeId: s.placeId,
          address: s.address,
        })),
      });
      toast.success('Rota atribuída! O aplicativo receberá a atualização em tempo real.');
      setSelected([]);
      setEstimate('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao designar rota');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="min-w-0 space-y-3 rounded-2xl border border-border bg-card p-3 sm:p-4"
      aria-label="Planejamento de rotas"
    >
      <header className="flex items-center gap-2">
        <Route size={18} />
        <h3 className="text-sm font-semibold">Planejar rota de entregas</h3>
      </header>
      <p className="text-xs text-muted-foreground">
        Origem fixa: <strong>{STORE}</strong>. As corridas são compartilhadas com o Android e o
        site.
      </p>
      <label className="block text-xs font-medium" htmlFor="jf-route-motoboy">
        Motoboy responsável
      </label>
      <select
        id="jf-route-motoboy"
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        value={motoboyId}
        onChange={(e) => setMotoboyId(e.target.value)}
      >
        <option value="">Selecione um motoboy</option>
        {motoboys.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {motoboyId && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Corridas aguardando início — selecione até 20</p>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {eligible.map((a) => (
              <label
                key={a.id}
                className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={selected.some((s) => s.assignmentId === a.id)}
                  onChange={() => toggle(a)}
                />
                <span className="min-w-0 truncate">
                  {a.clientName || a.description} · {a.location || 'Sem endereço'}
                </span>
              </label>
            ))}
            {!eligible.length && (
              <p className="text-xs text-muted-foreground">
                Nenhuma corrida pendente para este motoboy.
              </p>
            )}
          </div>
        </div>
      )}
      {selected.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium">Ordem de paradas ({selected.length})</p>
          {selected.map((s, i) => (
            <div
              key={s.assignmentId}
              className="flex min-w-0 items-start gap-2 rounded-xl border p-2"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 truncate text-xs font-semibold">{s.label}</div>
                <AddressPicker stop={s} onSelect={(v) => change(i, v)} />
              </div>
              <div className="flex shrink-0 flex-col">
                <button aria-label="Mover para cima" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={16} />
                </button>
                <button
                  aria-label="Mover para baixo"
                  disabled={i === selected.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={16} />
                </button>
              </div>
            </div>
          ))}
          {estimate && <p className="text-xs text-muted-foreground">{estimate}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!valid || busy || selected.length < 2}
              onClick={optimize}
            >
              <LocateFixed className="mr-2 h-4 w-4" />
              Sugerir ordem Google
            </Button>
            <Button type="button" disabled={!valid || busy} onClick={assign}>
              <MapPin className="mr-2 h-4 w-4" />
              Confirmar e enviar rota
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Otimização considera retorno à loja. Confira a ordem antes de enviar. Corridas iniciadas
            não podem ser reordenadas.
          </p>
        </div>
      )}
    </section>
  );
}
