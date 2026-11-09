import { Suspense, lazy, useState, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { AppProvider, useApp } from '@/contexts/AppContext';
import NativeShell, { type NativePlatform } from './NativeShell';
import MotoboySplash from '@/cosmos/mobile/roles/motoboy/MotoboySplash';
import { isMotoboyUser } from '@/cosmos/mobile/roles/motoboy/motoboyAccess';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const MobileLogin = lazy(() => import('@/cosmos/mobile/roles/motoboy/MotoboyLogin'));
const MotoboyExperience = lazy(() => import('@/cosmos/mobile/roles/motoboy/MotoboyExperience'));
const EmployeeBoardPage = lazy(() => import('@/pages/EmployeeBoardPage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));
const ChatPage = lazy(() => import('@/pages/ChatPage'));
const TaskTrackingPage = lazy(() => import('@/pages/TaskTrackingPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const MotoboyTrackingPage = lazy(() => import('@/pages/MotoboyTrackingPage'));
const DriveScreen = lazy(() => import('@/components/cosmos/shared/components/DriveScreen'));
const queryClient = new QueryClient();

function MotoboyGate({ children }: { children: ReactNode }) {
  const { currentUser, authLoading } = useApp();
  const location = useLocation();
  if (authLoading)
    return (
      <p role="status" className="p-8">
        Validando sessão…
      </p>
    );
  if (!currentUser) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!isMotoboyUser(currentUser)) return <Navigate to="/access-denied" replace />;
  return <>{children}</>;
}

function HomeRedirect({ platform }: { platform: NativePlatform }) {
  const { currentUser, authLoading } = useApp();
  if (authLoading)
    return (
      <p role="status" className="p-8">
        Validando sessão…
      </p>
    );
  if (!currentUser) return <Navigate to="/login" replace />;
  if (platform === 'android')
    return <Navigate to={isMotoboyUser(currentUser) ? '/motoboy' : '/access-denied'} replace />;
  return <Navigate to={currentUser.role === 'admin' ? '/admin' : '/board'} replace />;
}

function MotoboyAccessDenied() {
  const { logout } = useApp();
  const navigate = useNavigate();
  return (
    <main className="jf-moto-blocked" role="alert">
      <h1>Acesso exclusivo para motoboys</h1>
      <p>
        Esta versão do aplicativo é destinada somente aos usuários com o cargo de motoboy. Para os
        demais cargos, utilize o JapanFlow Web.
      </p>
      <button
        onClick={async () => {
          await logout();
          navigate('/login', { replace: true });
        }}
      >
        Voltar ao login
      </button>
    </main>
  );
}

function AppRoutes({ platform }: { platform: NativePlatform }) {
  return (
    <Suspense
      fallback={
        <div role="status" className="p-8 text-sm text-muted-foreground">
          Carregando JapanFlow…
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={platform === 'android' ? <MobileLogin /> : <LoginPage />} />
        {platform === 'android' && (
          <>
            <Route
              path="/motoboy/*"
              element={
                <MotoboyGate>
                  <MotoboyExperience />
                </MotoboyGate>
              }
            />
          </>
        )}
        {platform === 'android' && (
          <Route
            path="/chat"
            element={
              <MotoboyGate>
                <MotoboyExperience initialScreen="chat" />
              </MotoboyGate>
            }
          />
        )}
        {platform === 'android' && (
          <Route path="/access-denied" element={<MotoboyAccessDenied />} />
        )}
        {platform !== 'android' && (
          <Route element={<NativeShell platform={platform} />}>
            <Route path="/board" element={<EmployeeBoardPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/tracking" element={<TaskTrackingPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/drive" element={<DriveScreen />} />
            <Route path="/departmental/motoboys/mapa" element={<MotoboyTrackingPage />} />
          </Route>
        )}
        <Route path="*" element={<HomeRedirect platform={platform} />} />
      </Routes>
    </Suspense>
  );
}

export default function NativeApp({ platform }: { platform: NativePlatform }) {
  const [showSplash, setShowSplash] = useState(platform === 'android');
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <HashRouter>
          <AppProvider>
            {showSplash ? (
              <MotoboySplash onDone={() => setShowSplash(false)} />
            ) : (
              <AppRoutes platform={platform} />
            )}
          </AppProvider>
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
