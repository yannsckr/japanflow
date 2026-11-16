import { Navigate, Link } from 'react-router-dom';
import { Database, Cloud, Activity, ShieldAlert } from 'lucide-react';

import { useApp } from '@/contexts/AppContext';
import KanbanBoard from '@/components/KanbanBoard';
import CreateTaskDialog from '@/components/CreateTaskDialog';
import EmployeeCalendar from '@/components/EmployeeCalendar';
import CustomizableWorkspace from '@/components/CustomizableWorkspace';
import TaskSummaryWidget from '@/components/TaskSummaryWidget';
import QuickLinksWidget from '@/components/QuickLinksWidget';
import DailyCompletedCounter from '@/components/DailyCompletedCounter';
import TaskHistoryDialog from '@/components/TaskHistoryDialog';
import WorkScheduleBanner from '@/components/WorkScheduleBanner';
import PickupsPanel from '@/components/PickupsPanel';
import { QuotaProgress } from '@/components/QuotaProgress';

const AdminPage = () => {
  const { currentUser, authenticatedUser, getTasksForUser } = useApp();

  if (!currentUser || currentUser.role !== 'admin') {
    return <Navigate to="/login" replace />;
  }

  const isTiAccount =
    authenticatedUser?.username?.trim().toLowerCase() === 'japan-ti' ||
    (authenticatedUser?.sectors as string[] | undefined)?.includes('ti') ||
    currentUser.username?.trim().toLowerCase() === 'japan-ti' ||
    (currentUser.sectors as string[] | undefined)?.includes('ti');

  const tasks = getTasksForUser(currentUser.id);

  return (
    <div className="min-w-0 space-y-5 md:space-y-6">
      <section className="min-w-0">
        {isTiAccount ? (
          <div className="jf-surface flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <QuotaProgress compact />
            </div>
            <div
              className="flex shrink-0 flex-wrap items-center gap-2"
              aria-label="Atalhos de administração"
            >
              <a
                href="https://console.firebase.google.com/u/1/project/japanflow-erp/firestore"
                target="_blank"
                rel="noopener noreferrer"
                title="Firebase Firestore"
                aria-label="Abrir Firebase Firestore"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background hover:bg-muted"
              >
                <Database className="h-5 w-5" />
              </a>
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                title="Google Cloud"
                aria-label="Abrir Google Cloud"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background hover:bg-muted"
              >
                <Cloud className="h-5 w-5" />
              </a>
              <Link
                to="/gas"
                title="Gestão de Análise do Sistema"
                aria-label="Abrir GAS"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
              >
                <Activity className="h-5 w-5" />
                GAS
              </Link>
            </div>
          </div>
        ) : (
          <WorkScheduleBanner userId={currentUser.id} />
        )}
      </section>

      <section className="jf-surface overflow-hidden p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Meu espaço
            </p>

            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Meu Quadro
            </h1>

            <p className="mt-1.5 text-sm text-muted-foreground">
              {tasks.length} tarefa{tasks.length !== 1 ? 's' : ''} vinculada
              {tasks.length !== 1 ? 's' : ''} ao seu quadro.
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:flex lg:flex-wrap lg:items-center [&_button]:w-full lg:[&_button]:w-auto">
            <DailyCompletedCounter userId={currentUser.id} compact />
            <TaskHistoryDialog userId={currentUser.id} />
            <CreateTaskDialog />
            <CreateTaskDialog mode="order" />
          </div>
        </div>
      </section>

      <CustomizableWorkspace
        userId={currentUser.id}
        blocks={[
          { id: 'pickups', label: 'Retiradas', content: <PickupsPanel /> },
          {
            id: 'tasks',
            label: 'Tarefas',
            content: (
              <KanbanBoard
                tasks={tasks}
                boardUserId={currentUser.id}
                boardAuthUid={currentUser.authUid}
              />
            ),
          },
          {
            id: 'summary',
            label: 'Resumo das tarefas',
            content: <TaskSummaryWidget tasks={tasks} />,
          },
          {
            id: 'shortcuts',
            label: 'Atalhos',
            content: <QuickLinksWidget />,
          },
          {
            id: 'calendar',
            label: 'Calendário',
            content: <EmployeeCalendar userId={currentUser.id} />,
          },
        ]}
      />
    </div>
  );
};

export default AdminPage;
