import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { startLocationWatcher, stopLocationWatcher } from './nativeLocation';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Bike,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  History,
  Home,
  LogOut,
  Map,
  MapPin,
  Menu,
  MessageCircle,
  Navigation,
  RefreshCw,
  Palette,
  Send,
  UserRound,
  WifiOff,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';
import { useThemeToggle } from '@/hooks/useThemeToggle';
import ChatPage from '@/pages/ChatPage';
import VersionInfo from '@/cosmos/releases/VersionInfo';
import MotoboyMap from './MotoboyMap';
import { useMotoboyRides, type Ride } from './useMotoboyRides';
import { finishRide, reportRideOccurrence, startRide } from './motoboyWorkflow';
import logoLight from '@/assets/japanflow-logo-light.png';
import './motoboy-app.css';

type Screen =
  | 'home'
  | 'rides'
  | 'detail'
  | 'map'
  | 'proof'
  | 'success'
  | 'chat'
  | 'notifications'
  | 'history'
  | 'journey'
  | 'incident'
  | 'profile'
  | 'offline'
  | 'gps';
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—');
const status = (r: Ride) =>
  r.status === 'accepted'
    ? 'Em execução'
    : r.status === 'completed'
      ? 'Concluída'
      : r.status === 'pending_approval'
        ? 'Aguardando aprovação'
        : 'Aguardando início';
function Brand({ small = false }: { small?: boolean }) {
  return (
    <img
      src={logoLight}
      alt="JapanFlow"
      className={small ? 'jm-brand jm-brand-small' : 'jm-brand'}
    />
  );
}
function Top({
  title,
  back,
  onBell,
  onGps,
  menu = false,
  onHome,
}: {
  title?: string;
  back?: () => void;
  onBell?: () => void;
  onGps?: () => void;
  menu?: boolean;
  onHome?: () => void;
}) {
  return (
    <header className="jm-top">
      {back ? (
        <button type="button" className="jm-icon" onClick={back} aria-label="Voltar">
          <ArrowLeft size={20} />
        </button>
      ) : menu ? (
        <span className="jm-top-placeholder" />
      ) : (
        <span className="jm-top-placeholder" />
      )}
      {title ? (
        <strong className="jm-top-title">{title}</strong>
      ) : (
        <button
          type="button"
          className="jm-brand-button"
          onClick={onHome}
          aria-label="Voltar ao início"
        >
          <Brand small />
        </button>
      )}
      <div className="jm-header-actions">
        {onGps && (
          <button
            type="button"
            className="jm-icon"
            onClick={onGps}
            aria-label="Permissões de GPS"
            title="GPS"
          >
            <MapPin size={19} />
          </button>
        )}
        {onBell ? (
          <button type="button" className="jm-icon" onClick={onBell} aria-label="Notificações">
            <Bell size={20} />
          </button>
        ) : (
          <span className="jm-top-placeholder" />
        )}
      </div>
    </header>
  );
}
function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`jm-button ${secondary ? 'jm-button-secondary' : ''}`}
    >
      {children}
    </button>
  );
}
function Card({ ride, onClick }: { ride: Ride; onClick: () => void }) {
  return (
    <button type="button" className="jm-ride-card" onClick={onClick}>
      <span className="jm-ride-head">
        <strong>#{ride.id.slice(0, 8).toUpperCase()}</strong>
        <span
          className={`jm-badge ${ride.status === 'completed' ? 'jm-badge-success' : ride.status === 'accepted' ? 'jm-badge-active' : ''}`}
        >
          {status(ride)}
        </span>
      </span>
      <strong className="jm-ride-client">{ride.clientName || 'Entrega'}</strong>
      <span className="jm-ride-address">
        <MapPin size={13} />
        {ride.location || 'Endereço não informado'}
      </span>
      <span className="jm-ride-foot">
        {ride.scheduledFor ? date(ride.scheduledFor) : 'Designada'}
        <ChevronRight size={16} />
      </span>
    </button>
  );
}
function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="jm-tile">
      <b>{value}</b>
      <small>{label}</small>
    </div>
  );
}
function HeaderText({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="jm-screen-head">
      {eyebrow && <small className="jm-eyebrow">{eyebrow}</small>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  );
}
export default function MotoboyExperience({ initialScreen = 'home' }: { initialScreen?: Screen }) {
  const { currentUser, logout, notifications, markNotificationRead } = useApp();
  const navigate = useNavigate();
  const { theme, setTheme } = useThemeToggle();
  useEffect(() => {
    if (localStorage.getItem('japanflow-theme') === null) setTheme('light');
  }, [setTheme]);
  const rides = useMotoboyRides(currentUser?.id);
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [trackingBusy, setTrackingBusy] = useState(false);
  useEffect(() => {
    if (drawer) setDrawerMounted(true);
    else if (drawerMounted) {
      const timeout = window.setTimeout(() => setDrawerMounted(false), 320);
      return () => window.clearTimeout(timeout);
    }
  }, [drawer, drawerMounted]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'completed'>('all');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [incidentType, setIncidentType] = useState('Cliente ausente');
  const [incidentText, setIncidentText] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [mapSheetCollapsed, setMapSheetCollapsed] = useState(false);
  const [sheetTouchY, setSheetTouchY] = useState<number | null>(null);
  const [gpsState, setGpsState] = useState<'unknown' | 'ok' | 'denied'>('unknown');
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const selected = rides.all.find((r) => r.id === selectedId) || null;
  const open = (r: Ride) => {
    setSelectedId(r.id);
    setScreen('detail');
  };
  const go = (next: Screen) => {
    setDrawer(false);
    setScreen(next);
  };
  const requestGps = async () => {
    if (trackingBusy) return;
    setTrackingBusy(true);
    try {
      if (Capacitor.isNativePlatform()) {
        await startLocationWatcher(
          () => setGpsState('ok'),
          (message) => {
            setGpsState('denied');
            toast.error(message);
          }
        );
        setTracking(true);
        setGpsState('ok');
        toast.success('Rastreamento ativo no dispositivo');
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          () => {
            setGpsState('ok');
            toast.success('Localização autorizada no navegador');
          },
          () => {
            setGpsState('denied');
            toast.error('Localização não autorizada');
          },
          { enableHighAccuracy: true, timeout: 12000 }
        );
      } else {
        throw new Error('GPS não disponível neste dispositivo');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível iniciar o GPS';
      if (
        Capacitor.isNativePlatform() &&
        /plugin|segundo plano|not implemented/i.test(message) &&
        navigator.geolocation
      ) {
        navigator.geolocation.getCurrentPosition(
          () => {
            setGpsState('ok');
            setTracking(false);
            toast.warning(
              'Localização em primeiro plano autorizada. Rastreamento em segundo plano indisponível neste APK.'
            );
          },
          () => {
            setGpsState('denied');
            toast.error('Localização não autorizada. Verifique as permissões do Android.');
          },
          { enableHighAccuracy: true, timeout: 15000 }
        );
      } else {
        setGpsState('denied');
        toast.error(message);
      }
    } finally {
      setTrackingBusy(false);
    }
  };
  const stopGps = async () => {
    setTrackingBusy(true);
    try {
      await stopLocationWatcher();
      setTracking(false);
      toast.success('Rastreamento encerrado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao encerrar rastreamento');
    } finally {
      setTrackingBusy(false);
    }
  };
  const execute = async (action: () => Promise<void>, success: string, after: Screen) => {
    if (busy || !online) return;
    setBusy(true);
    try {
      await action();
      toast.success(success);
      go(after);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível concluir a operação.');
    } finally {
      setBusy(false);
    }
  };
  const unread = notifications.filter((n) => !n.read).length;
  const today = new Date().toLocaleDateString('en-CA');
  const todayRides = rides.all.filter(
    (r) => (r.scheduledFor || r.createdAt || '').slice(0, 10) === today
  );
  const todayCompleted = rides.completed.filter(
    (r) => (r.completedAt || '').slice(0, 10) === today
  );
  const list = useMemo(
    () => rides.all.filter((r) => filter === 'all' || r.status === filter),
    [rides.all, filter]
  );
  const bottom = (
    <nav className="jm-bottom" aria-label="Navegação inferior">
      {[
        { key: 'home' as Screen, label: 'Início', icon: Home },
        { key: 'rides' as Screen, label: 'Corridas', icon: Bike },
        { key: 'map' as Screen, label: 'Mapa', icon: Map },
        { key: 'chat' as Screen, label: 'Chat', icon: MessageCircle },
        { key: 'profile' as Screen, label: 'Perfil', icon: UserRound },
      ].map(({ key, label, icon: Icon }) => (
        <button
          type="button"
          className={screen === key ? 'jm-active' : ''}
          key={key}
          onClick={() => go(key)}
        >
          <Icon size={19} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
  const top = (title?: string, withGps = false) => (
    <Top
      title={title}
      back={screen === 'home' ? undefined : () => go('home')}
      onBell={() => go('notifications')}
      onGps={withGps ? () => go('gps') : undefined}
      onHome={() => go('home')}
    />
  );
  return (
    <main className={`jm-app jm-theme-${theme}`}>
      {!online && screen !== 'offline' && (
        <button className="jm-offline-alert" onClick={() => go('offline')}>
          <WifiOff size={15} /> Sem conexão — toque para detalhes
        </button>
      )}
      {screen === 'home' && (
        <>
          <header className="jm-home-header">
            <button className="jm-icon" onClick={() => setDrawer(true)} aria-label="Abrir menu">
              <Menu size={21} />
            </button>
            <button
              type="button"
              className="jm-brand-button"
              onClick={() => go('home')}
              aria-label="Voltar ao início"
            >
              <Brand small />
            </button>
            <button
              className="jm-icon"
              onClick={() => go('notifications')}
              aria-label="Notificações"
            >
              <Bell size={19} />
              {unread > 0 && <i className="jm-dot" />}
            </button>
          </header>
          <div className="jm-scroll jm-home-scroll">
            <div className="jm-home-welcome">
              <small>
                {new Date().toLocaleDateString('pt-BR', {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                })}
              </small>
              <h1>
                Oi, {currentUser?.name?.split(' ')[0] || 'motoboy'}!{' '}
                <span aria-hidden="true">🏍️</span>
              </h1>
              <p>Acompanhe suas corridas e sua próxima entrega.</p>
            </div>
            <div className="jm-stats">
              <Tile label="Corridas hoje" value={todayRides.length} />
              <Tile label="Concluídas" value={todayCompleted.length} />
              <Tile label="Pendentes" value={rides.pending.length} />
            </div>
            <div className="jm-title-line">
              <strong>Sua próxima rota</strong>
              <button onClick={() => go('map')}>
                Ver mapa <ArrowRight size={13} />
              </button>
            </div>
            <div className="jm-home-map">
              <MotoboyMap rides={rides.route} />
            </div>
            <div className="jm-title-line">
              <strong>Em destaque</strong>
              <button onClick={() => go('rides')}>
                Todas as corridas <ArrowRight size={13} />
              </button>
            </div>
            {rides.loading ? (
              <p className="jm-muted">Sincronizando corridas…</p>
            ) : rides.error ? (
              <p role="alert" className="jm-error">
                {rides.error}
              </p>
            ) : rides.route.length ? (
              <Card
                ride={rides.active[0] || rides.pending[0]}
                onClick={() => open(rides.active[0] || rides.pending[0])}
              />
            ) : (
              <p className="jm-empty">Nenhuma entrega atribuída no momento.</p>
            )}
            <div className="jm-title-line">
              <strong>Corridas pendentes ({rides.pending.length})</strong>
              <button
                onClick={() => {
                  setFilter('pending');
                  go('rides');
                }}
              >
                Ver todas <ArrowRight size={13} />
              </button>
            </div>
            {rides.pending.slice(0, 2).map((r) => (
              <Card key={r.id} ride={r} onClick={() => open(r)} />
            ))}
            <VersionInfo />
          </div>
          {bottom}
        </>
      )}
      {screen === 'rides' && (
        <>
          {top()}
          <div className="jm-scroll jm-page">
            <HeaderText
              eyebrow="SUA OPERAÇÃO"
              title="Minhas corridas"
              description="Acompanhe o que foi atribuído a você."
            />
            <div className="jm-stats jm-stats-inline">
              <Tile label="Em execução" value={rides.active.length} />
              <Tile label="Pendentes" value={rides.pending.length} />
              <Tile label="Concluídas" value={rides.completed.length} />
            </div>
            <div className="jm-filter" role="group" aria-label="Filtrar corridas">
              {(
                [
                  { id: 'all', label: 'Todas' },
                  { id: 'pending', label: 'Pendentes' },
                  { id: 'accepted', label: 'Em execução' },
                  { id: 'completed', label: 'Concluídas' },
                ] as const
              ).map((x) => (
                <button
                  key={x.id}
                  className={filter === x.id ? 'jm-selected' : ''}
                  onClick={() => setFilter(x.id)}
                >
                  {x.label}
                </button>
              ))}
            </div>
            <p className="jm-section-caption">{list.length} corridas encontradas</p>
            {rides.error && (
              <p role="alert" className="jm-error">
                {rides.error}
              </p>
            )}
            {list.map((r) => (
              <Card key={r.id} ride={r} onClick={() => open(r)} />
            ))}
            {!list.length && <p className="jm-empty">Nenhuma corrida neste filtro.</p>}
          </div>
          {bottom}
        </>
      )}
      {screen === 'detail' && (
        <>
          {top('Detalhe da corrida')}
          <div className="jm-scroll jm-page">
            {selected ? (
              <>
                <div className="jm-badge jm-badge-out">{status(selected)}</div>
                <HeaderText
                  title={selected.clientName || 'Entrega'}
                  description={selected.description || 'Detalhes da entrega atribuída'}
                />
                <div className="jm-panel">
                  <small>TRAJETO DE ENTREGA</small>
                  <h3>
                    <MapPin size={17} /> {selected.location || 'Endereço não informado'}
                  </h3>
                  <div className="jm-action-pair">
                    <Button secondary onClick={() => go('map')}>
                      <Navigation size={16} /> Ver rota
                    </Button>
                    <Button
                      secondary
                      onClick={() =>
                        selected.location
                          ? window.open(
                              `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selected.location)}&travelmode=driving&dir_action=navigate`,
                              '_blank',
                              'noopener,noreferrer'
                            )
                          : toast.error('Endereço não informado')
                      }
                    >
                      <MapPin size={16} /> Abrir mapa
                    </Button>
                  </div>
                </div>
                <div className="jm-panel">
                  <small>INFORMAÇÕES DA CORRIDA</small>
                  <p>
                    <b>Número</b>
                    <span>#{selected.id.slice(0, 8).toUpperCase()}</span>
                  </p>
                  <p>
                    <b>Cliente</b>
                    <span>{selected.clientName || '—'}</span>
                  </p>
                  <p>
                    <b>Status</b>
                    <span>{status(selected)}</span>
                  </p>
                  <p>
                    <b>Designada</b>
                    <span>{date(selected.createdAt)}</span>
                  </p>
                  {selected.notes && <p className="jm-notes">{selected.notes}</p>}
                </div>
                {selected.status === 'pending' && (
                  <Button
                    disabled={busy || !online}
                    onClick={() => {
                      setSelectedId(selected.id);
                      void execute(
                        () => startRide(selected.id, currentUser!.id),
                        'Corrida iniciada',
                        'map'
                      );
                    }}
                  >
                    <Navigation size={18} /> {busy ? 'Iniciando…' : 'Iniciar corrida'}
                  </Button>
                )}
                {selected.status === 'accepted' && (
                  <Button onClick={() => go('proof')}>
                    <Camera size={18} /> Finalizar com foto da notinha
                  </Button>
                )}
                {selected.status === 'completed' && (
                  <div className="jm-panel">
                    <CheckCircle2 color="#15803d" />
                    <b>Entrega concluída</b>
                    {selected.proofUrl && (
                      <a href={selected.proofUrl} target="_blank" rel="noopener noreferrer">
                        Ver comprovante
                      </a>
                    )}
                  </div>
                )}
                {selected.status !== 'completed' && (
                  <button className="jm-link" onClick={() => go('incident')}>
                    <CircleAlert size={17} /> Reportar ocorrência
                  </button>
                )}
              </>
            ) : (
              <p className="jm-empty">
                Corrida não encontrada. Pode ter sido removida ou transferida.
              </p>
            )}
          </div>
          {bottom}
        </>
      )}
      {screen === 'map' && (
        <>
          {top('Rota de entrega')}
          <div className="jm-scroll jm-map-screen">
            <div className="jm-map-large">
              <MotoboyMap
                rides={
                  selected && selected.status === 'accepted'
                    ? [selected]
                    : rides.active.length
                      ? rides.active
                      : rides.route
                }
              />
            </div>
            <div
              className={`jm-map-sheet ${mapSheetCollapsed ? 'jm-map-sheet-collapsed' : ''}`}
              onTouchStart={(event) => setSheetTouchY(event.touches[0]?.clientY ?? null)}
              onTouchEnd={(event) => {
                if (sheetTouchY === null) return;
                const delta = (event.changedTouches[0]?.clientY ?? sheetTouchY) - sheetTouchY;
                if (Math.abs(delta) > 55) setMapSheetCollapsed(delta > 0);
                setSheetTouchY(null);
              }}
            >
              <button
                className="jm-sheet-handle"
                type="button"
                aria-expanded={!mapSheetCollapsed}
                aria-label={
                  mapSheetCollapsed ? 'Expandir painel de entregas' : 'Recolher painel de entregas'
                }
                onClick={() => setMapSheetCollapsed((v) => !v)}
              >
                <span />
                <small>{mapSheetCollapsed ? 'Mostrar entregas' : 'Recolher entregas'}</small>
              </button>
              {!mapSheetCollapsed && (
                <>
                  <small>DESTINO / SUA PRÓXIMA ENTREGA</small>
                  <h2>
                    {selected?.clientName ||
                      rides.active[0]?.clientName ||
                      rides.pending[0]?.clientName ||
                      'Nenhuma rota ativa'}
                  </h2>
                  <p>
                    <MapPin size={15} />
                    {selected?.location ||
                      rides.active[0]?.location ||
                      rides.pending[0]?.location ||
                      'Aguardando uma entrega atribuída'}
                  </p>
                  <p className="jm-muted">
                    O mapa mostra sua localização. Para orientação curva a curva, abra o aplicativo
                    de mapas.
                  </p>
                  <div className="jm-action-pair">
                    <Button
                      secondary
                      onClick={() => {
                        const r = selected || rides.active[0] || rides.pending[0];
                        if (r) open(r);
                        else go('rides');
                      }}
                    >
                      Ver corrida
                    </Button>
                    <Button
                      onClick={() => {
                        const r = selected || rides.active[0] || rides.pending[0];
                        if (r?.location)
                          window.open(
                            `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.location)}&travelmode=driving&dir_action=navigate`,
                            '_blank',
                            'noopener,noreferrer'
                          );
                        else toast.error('Não há endereço disponível');
                      }}
                    >
                      <Navigation size={17} /> Navegar
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
          {bottom}
        </>
      )}
      {screen === 'proof' && (
        <>
          {top('Comprovante')}
          <div className="jm-scroll jm-page">
            <HeaderText
              eyebrow="ETAPA FINAL"
              title="Comprovante de entrega"
              description="Fotografe a notinha assinada para finalizar a corrida."
            />
            <label className="jm-photo-zone">
              <Camera size={34} />
              {preview ? (
                <img src={preview} alt="Prévia do comprovante" />
              ) : (
                <>
                  <b>Adicione a foto da notinha</b>
                  <small>Foto legível com a assinatura do recebedor</small>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setFile(e.currentTarget.files?.[0] || null)}
              />
            </label>
            <p className="jm-warning">
              A corrida só será concluída após o envio e confirmação do comprovante no Firebase.
            </p>
            <Button
              disabled={!selected || selected.status !== 'accepted' || !file || busy || !online}
              onClick={() =>
                selected &&
                file &&
                execute(
                  () => finishRide(selected.id, currentUser!.id, file),
                  'Comprovante registrado',
                  'success'
                )
              }
            >
              <Check size={18} />
              {busy ? 'Enviando foto…' : 'Confirmar entrega'}
            </Button>
          </div>
        </>
      )}
      {screen === 'success' && (
        <>
          {top('Entrega finalizada')}
          <div className="jm-success">
            <span className="jm-success-icon">
              <Check size={48} />
            </span>
            <small>ENTREGA REGISTRADA</small>
            <h1>Boa entrega!</h1>
            <p>A corrida foi concluída e o comprovante registrado no sistema.</p>
            <div className="jm-panel">
              <p>
                <b>Corrida</b>
                <span>#{selected?.id.slice(0, 8).toUpperCase()}</span>
              </p>
              <p>
                <b>Cliente</b>
                <span>{selected?.clientName || '—'}</span>
              </p>
            </div>
          </div>
          <div className="jm-fixed-action">
            <Button
              onClick={() => {
                setSelectedId(null);
                setFile(null);
                go('home');
              }}
            >
              Voltar ao início <ArrowRight size={17} />
            </Button>
          </div>
        </>
      )}
      {screen === 'chat' && (
        <>
          {top('Mensagens')}
          <div className="jm-scroll jm-chat-wrap">
            <div className="jm-chat-intro">
              <strong>Conversas da equipe</strong>
              <span>Mensagens sincronizadas com o JapanFlow Web</span>
            </div>
            <ChatPage initialTab="contacts" />
          </div>
          {bottom}
        </>
      )}
      {screen === 'notifications' && (
        <>
          {top('Notificações')}
          <div className="jm-scroll jm-page">
            <HeaderText
              title="Notificações"
              description="Atualizações importantes para sua operação."
            />
            {notifications.length ? (
              notifications.slice(0, 60).map((n) => (
                <button
                  key={n.id}
                  className={`jm-notification ${n.read ? '' : 'jm-unread'}`}
                  onClick={() => {
                    markNotificationRead(n.id);
                    go('rides');
                  }}
                >
                  <span className="jm-notif-icon">
                    <Bell size={17} />
                  </span>
                  <div>
                    <b>{n.message || 'Atualização do sistema'}</b>
                    <small>{n.timestamp ? date(n.timestamp) : 'JapanFlow'}</small>
                  </div>
                  {!n.read && <i />}
                </button>
              ))
            ) : (
              <p className="jm-empty">Nenhuma notificação no momento.</p>
            )}
          </div>
          {bottom}
        </>
      )}
      {screen === 'history' && (
        <>
          {top('Histórico')}
          <div className="jm-scroll jm-page">
            <HeaderText
              eyebrow="REGISTROS"
              title="Histórico"
              description="Consulte suas corridas concluídas."
            />
            <div className="jm-stats jm-stats-inline jm-history-stats">
              <Tile label="Corridas concluídas" value={rides.completed.length} />
            </div>
            {rides.completed.map((r) => (
              <Card ride={r} key={r.id} onClick={() => open(r)} />
            ))}
            {!rides.completed.length && (
              <p className="jm-empty">Você ainda não possui corridas concluídas.</p>
            )}
          </div>
          {bottom}
        </>
      )}
      {screen === 'journey' && (
        <>
          {top('Minha jornada')}
          <div className="jm-scroll jm-page">
            <HeaderText
              eyebrow="MINHA OPERAÇÃO"
              title="Minha jornada"
              description="Resumo das corridas registradas na sua conta."
            />
            <div className="jm-stats jm-stats-inline">
              <Tile label="Em andamento" value={rides.active.length} />
              <Tile label="Pendentes" value={rides.pending.length} />
              <Tile label="Entregues" value={rides.completed.length} />
            </div>
            <div className="jm-panel">
              <h3>Atividade registrada</h3>
              {rides.all.slice(0, 30).map((r) => (
                <button className="jm-timeline-item" key={r.id} onClick={() => open(r)}>
                  <span
                    className={`jm-timeline-bullet ${r.status === 'completed' ? 'jm-done' : ''}`}
                  />
                  <div>
                    <b>{r.clientName || 'Corrida'}</b>
                    <small>
                      {status(r)} • {date(r.completedAt || r.acceptedAt || r.createdAt)}
                    </small>
                  </div>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
            <p className="jm-warning">
              O registro de ponto e os horários oficiais da jornada serão integrados separadamente.
              Este painel mostra apenas a atividade das corridas.
            </p>
          </div>
          {bottom}
        </>
      )}
      {screen === 'incident' && (
        <>
          {top('Ocorrência')}
          <div className="jm-scroll jm-page">
            <HeaderText
              eyebrow="SUPORTE OPERACIONAL"
              title="Reportar ocorrência"
              description="Registre um problema para que a equipe visualize nas observações da corrida."
            />
            <div className="jm-panel">
              <label htmlFor="jm-incident-type">Tipo de ocorrência</label>
              <select
                id="jm-incident-type"
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value)}
              >
                <option>Cliente ausente</option>
                <option>Endereço incorreto</option>
                <option>Atraso</option>
                <option>Problema com o veículo</option>
                <option>Outro</option>
              </select>
              <label htmlFor="jm-incident-text">O que aconteceu?</label>
              <textarea
                id="jm-incident-text"
                maxLength={1000}
                rows={6}
                placeholder="Descreva o problema para a equipe…"
                value={incidentText}
                onChange={(e) => setIncidentText(e.target.value)}
              />
            </div>
            <p className="jm-warning">
              O relato será registrado nas observações desta corrida, visíveis no ERP. Não altera o
              status nem envia mensagens automáticas.
            </p>
            <Button
              disabled={!selected || busy || !online || incidentText.trim().length < 10}
              onClick={() =>
                selected &&
                execute(
                  () =>
                    reportRideOccurrence(selected.id, currentUser!.id, incidentType, incidentText),
                  'Ocorrência registrada',
                  'detail'
                )
              }
            >
              <Send size={17} />
              {busy ? 'Enviando…' : 'Enviar ocorrência'}
            </Button>
          </div>
        </>
      )}
      {screen === 'profile' && (
        <>
          {top(undefined, true)}
          <div className="jm-scroll jm-page">
            <HeaderText eyebrow="MINHA CONTA" title="Meu perfil" />
            <div className="jm-profile-hero">
              <span>
                {(currentUser?.name || 'JF')
                  .split(' ')
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </span>
              <b>{currentUser?.name}</b>
              <small>{currentUser?.function || 'Equipe JapanFlow'}</small>
            </div>
            <div className="jm-stats jm-stats-inline">
              <Tile label="Concluídas" value={rides.completed.length} />
              <Tile label="Em aberto" value={rides.route.length} />
            </div>
            <div className="jm-panel jm-settings">
              {(
                [
                  { label: 'Minha jornada', to: 'journey' },
                  { label: 'Histórico de corridas', to: 'history' },
                  { label: 'Notificações', to: 'notifications' },
                ] as const
              ).map((x) => (
                <button key={x.to} onClick={() => go(x.to)}>
                  {x.label}
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
            <div className="jm-version-panel">
              <VersionInfo withCheck />
            </div>
            <Button
              secondary
              onClick={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
            >
              <LogOut size={17} /> Sair da conta
            </Button>
          </div>
          {bottom}
        </>
      )}
      {screen === 'offline' && (
        <>
          {top('Sem conexão')}
          <div className="jm-state">
            <WifiOff size={45} />
            <h1>{online ? 'Conexão restabelecida' : 'Você está offline'}</h1>
            <p>
              Não é possível iniciar ou finalizar corridas sem confirmar as alterações com o
              servidor.
            </p>
            <Button onClick={() => (online ? go('home') : window.location.reload())}>
              <RefreshCw size={17} /> {online ? 'Voltar ao início' : 'Tentar novamente'}
            </Button>
          </div>
        </>
      )}
      {screen === 'gps' && (
        <>
          {top('GPS')}
          <div className="jm-state">
            <MapPin size={47} className="jm-red" />
            <h1>Localização do motoboy</h1>
            <p>
              Para acompanhar sua jornada e o mapa, o JapanFlow precisa acessar a localização
              durante o uso do aplicativo.
            </p>
            <div className="jm-panel">
              <b>
                Localização{' '}
                {gpsState === 'ok'
                  ? 'autorizada'
                  : gpsState === 'denied'
                    ? 'não autorizada'
                    : 'não verificada'}
              </b>
              <small>
                {tracking
                  ? 'Rastreamento ativo, inclusive em segundo plano. Uma notificação Android permanece visível.'
                  : 'O rastreamento só inicia após sua autorização. Na versão web, apenas a localização pontual está disponível.'}
              </small>
            </div>
            {tracking ? (
              <Button onClick={stopGps} disabled={trackingBusy}>
                <MapPin size={17} /> Encerrar rastreamento
              </Button>
            ) : (
              <Button onClick={requestGps} disabled={trackingBusy}>
                <MapPin size={17} />{' '}
                {trackingBusy ? 'Solicitando acesso…' : 'Autorizar localização'}
              </Button>
            )}
          </div>
        </>
      )}
      {drawerMounted && (
        <div
          className={`jm-drawer-overlay ${drawer ? 'jm-drawer-open' : 'jm-drawer-closing'}`}
          onClick={() => setDrawer(false)}
        >
          <aside
            className="jm-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            aria-hidden={!drawer}
          >
            <div className="jm-drawer-head">
              <Brand />
              <button aria-label="Fechar menu" onClick={() => setDrawer(false)}>
                <X />
              </button>
            </div>
            <p className="jm-eyebrow">PRINCIPAL</p>
            {(
              [
                { label: 'Início', to: 'home', icon: Home },
                { label: 'Minhas corridas', to: 'rides', icon: Bike },
                { label: 'Mapa de rotas', to: 'map', icon: Map },
                { label: 'Minha jornada', to: 'journey', icon: Clock3 },
                { label: 'Chat interno', to: 'chat', icon: MessageCircle },
                { label: 'Notificações', to: 'notifications', icon: Bell },
                { label: 'Histórico', to: 'history', icon: History },
                { label: 'Ocorrências', to: 'incident', icon: CircleAlert },
                { label: 'Meu perfil', to: 'profile', icon: UserRound },
              ] as const
            ).map(({ label, to, icon: Icon }) => (
              <button
                className={screen === to ? 'jm-drawer-selected' : ''}
                key={to}
                onClick={() => {
                  if (to === 'incident' && !selected) {
                    toast('Selecione uma corrida primeiro');
                    go('rides');
                  } else go(to);
                }}
              >
                <Icon size={18} />
                {label}
                <ChevronRight size={15} />
              </button>
            ))}
            <div className="jm-theme-settings">
              <label htmlFor="jm-theme-select">
                <Palette size={16} /> Aparência
              </label>
              <select
                id="jm-theme-select"
                value={theme}
                onChange={(e) =>
                  setTheme(e.target.value as 'light' | 'dark' | 'mono-light' | 'mono-dark')
                }
              >
                <option value="light">Claro</option>
                <option value="dark">Escuro</option>
                <option value="mono-light">Monocromático claro</option>
                <option value="mono-dark">Monocromático escuro</option>
              </select>
            </div>
            <div className="jm-drawer-footer">
              <span className="jm-avatar">{currentUser?.name?.[0] || 'J'}</span>
              <div>
                <b>{currentUser?.name}</b>
                <small>{currentUser?.function || 'JapanFlow'}</small>
              </div>
              <button
                onClick={async () => {
                  await logout();
                  navigate('/login', { replace: true });
                }}
                aria-label="Sair"
              >
                <LogOut size={19} />
              </button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
