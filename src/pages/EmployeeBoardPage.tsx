import { useParams } from 'react-router-dom';
import { UserRound, Database, Cloud, Activity, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useApp } from '@/contexts/AppContext';
import { useTaskPermissions } from '@/hooks/useTaskPermissions';
import { canCreateTasksForAll } from '@/lib/taskCreateAccess';
import KanbanBoard from '@/components/KanbanBoard';
import SectorTasksList from '@/components/SectorTasksList';
import { isJulio } from '@/lib/taskAudience';
import PickupsPanel from '@/components/PickupsPanel';
import { canSeePickups } from '@/components/PickupsPanel';
import CreateTaskDialog from '@/components/CreateTaskDialog';
import EmployeeCalendar from '@/components/EmployeeCalendar';
import CustomizableWorkspace from '@/components/CustomizableWorkspace';
import TaskSummaryWidget from '@/components/TaskSummaryWidget';
import QuickLinksWidget from '@/components/QuickLinksWidget';
import DailyCompletedCounter from '@/components/DailyCompletedCounter';
import TaskHistoryDialog from '@/components/TaskHistoryDialog';
import WorkScheduleBanner from '@/components/WorkScheduleBanner';
import { QuotaProgress } from '@/components/QuotaProgress';
import { SECTOR_LABELS, Sector } from '@/types';

const EmployeeBoardPage = () => {
  const { employeeId } = useParams();
  const { currentUser, authenticatedUser, isActingAsTi, users, getTasksForUser } = useApp();
  const tiDashboard =
    authenticatedUser?.username?.trim().toLowerCase() === 'japan-ti' ||
    isActingAsTi ||
    (authenticatedUser?.sectors as string[] | undefined)?.includes('ti') ||
    currentUser?.role === 'admin';
  const { permissions, loading: permissionsLoading } = useTaskPermissions();

  const isAdmin = currentUser?.role === 'admin';

  const viewUserId = isAdmin && employeeId ? employeeId : currentUser?.id;

  const viewUser = viewUserId ? users.find((user) => user.id === viewUserId) : undefined;
  const isWilliamBoard =
    viewUser?.id === 'emp-12' ||
    viewUser?.username?.trim().toLowerCase().replace(/_+$/, '') === 'william';

  const tasks = viewUserId ? getTasksForUser(viewUserId) : [];
  const activeTaskCount = tasks.filter(
    (task) => !(task as typeof task & { archivedAt?: string }).archivedAt
  ).length;

  const hasPermissions =
    currentUser && !permissionsLoading
      ? permissions.some((permission) => permission.granterId === currentUser.id)
      : false;

  const canCreateForAll = canCreateTasksForAll(currentUser);
  const showCreateTask = canCreateForAll || hasPermissions;

  const boardTitle = isAdmin ? `Quadro de ${viewUser?.name ?? 'colaborador'}` : 'Meu Quadro';

  if (!viewUserId) {
    return null;
  }

  return (
    <div className="w-full min-w-0 space-y-5 md:space-y-6">
      {tiDashboard && !employeeId ? (
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
            <Link
              to="/sentinel"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
            >
              <ShieldAlert className="h-4 w-4" />
              Sentinel
            </Link>
          </div>
        </div>
      ) : (
        <WorkScheduleBanner userId={viewUserId} />
      )}

      <section className="jf-diagonal-accent overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-card md:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              {isAdmin ? 'Equipe' : 'Meu espaço'}
            </p>

            <div className="mt-2 flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UserRound className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">
                  {boardTitle}
                </h1>

                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {activeTaskCount} tarefa
                    {activeTaskCount !== 1 ? 's' : ''} vinculada
                    {activeTaskCount !== 1 ? 's' : ''}
                  </span>

                  {viewUser?.function && (
                    <>
                      <span>•</span>
                      <span>{viewUser.function}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {!!viewUser?.sectors?.length && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {viewUser.sectors.map((sector) => (
                  <span
                    key={sector}
                    className="rounded-lg border border-border/70 bg-muted/35 px-2 py-1 text-[10px] font-medium text-muted-foreground"
                  >
                    {SECTOR_LABELS[sector as Sector]}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DailyCompletedCounter userId={viewUserId} compact />

            <TaskHistoryDialog userId={viewUserId} />

            {isAdmin && <CreateTaskDialog preselectedAssignee={viewUserId} />}

            {!isAdmin && showCreateTask && <CreateTaskDialog />}
            {!isWilliamBoard && <CreateTaskDialog mode="order" />}
          </div>
        </div>
      </section>

      <CustomizableWorkspace
        userId={viewUserId}
        blocks={[
          ...(currentUser?.id === viewUserId && isJulio(currentUser)
            ? [
                {
                  id: 'sector-tasks',
                  label: 'Tarefas do setor',
                  content: <SectorTasksList userId={viewUserId} />,
                },
              ]
            : []),
          ...(currentUser && !employeeId && canSeePickups(currentUser)
            ? [{ id: 'pickups', label: 'Retiradas', content: <PickupsPanel /> }]
            : []),
          {
            id: 'tasks',
            label: 'Tarefas',
            content: (
              <>
                <section className="min-w-0">
                  <KanbanBoard
                    tasks={tasks}
                    boardUserId={viewUserId}
                    boardAuthUid={viewUser?.authUid}
                  />
                </section>
              </>
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
            content: <EmployeeCalendar userId={viewUserId} />,
          },
        ]}
        actions={
          permissionsLoading && (
            <span className="text-xs text-muted-foreground">Verificando permissões…</span>
          )
        }
      />
    </div>
  );
};

export default EmployeeBoardPage;
