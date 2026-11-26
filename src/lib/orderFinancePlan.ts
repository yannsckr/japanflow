// Pure routing policy used by the order form. Explicit assignees are required for personal boards.
type Recipient = { id: string; username: string; active?: boolean; role: string };
type Options = {
  separation: boolean;
  paid: boolean;
  nf: boolean;
  boleto: boolean;
  troca: boolean;
  client: string;
};
export type FinanceTask = {
  kind: 'payment' | 'documents' | 'exchange';
  title: string;
  instructions: string;
  assigneeId: string;
  assigneeIds: string[];
  sector: 'financeiro' | null;
};
type Result = { ok: true; tasks: FinanceTask[] } | { ok: false; error: string };
const normalize = (username: string) =>
  (username || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_+$/, '');

export function planOrderFinance(users: Recipient[], options: Options): Result {
  if (!options.separation) return { ok: true, tasks: [] };
  const shared = options.nf || options.boleto;
  const resolve = (name: string) => {
    const matches = users.filter(
      (user) =>
        user.active !== false &&
        ['employee', 'admin'].includes(user.role) &&
        normalize(user.username) === name &&
        user.id.trim()
    );
    return matches.length === 1 ? matches[0].id : null;
  };
  const carol = options.paid || shared ? resolve('carol') : null;
  const patricia = shared ? resolve('patricia') : null;
  if ((options.paid || shared) && !carol)
    return {
      ok: false,
      error:
        'Não foi possível identificar uma única conta ativa da Carol. Nenhum pedido foi criado.',
    };
  if (shared && (!patricia || patricia === carol))
    return {
      ok: false,
      error:
        'Não foi possível identificar uma única conta ativa da Patrícia. Nenhum pedido foi criado.',
    };
  const tasks: FinanceTask[] = [];
  if (options.paid && carol)
    tasks.push({
      kind: 'payment',
      title: `Baixa de Pedido - ${options.client}`,
      instructions:
        'Dar baixa do pagamento no sistema de vendas. Conferir comprovantes ou créditos informados.',
      assigneeId: carol,
      assigneeIds: [],
      sector: 'financeiro',
    });
  const label = options.nf && options.boleto ? 'NF + Boleto' : options.nf ? 'Emissão NF' : 'Boleto';
  if (shared && carol && patricia)
    tasks.push({
      kind: 'documents',
      title: `${options.troca ? 'TROCA - ' : ''}${label}: Separação de pedido - ${options.client}`,
      instructions: [
        options.nf ? 'Emitir nota fiscal.' : '',
        options.boleto ? 'Gerar boleto.' : '',
        options.troca ? 'Atenção: pedido de troca.' : '',
      ]
        .filter(Boolean)
        .join(' '),
      assigneeId: patricia,
      assigneeIds: [patricia, carol],
      sector: null,
    });
  // Preserve the existing exchange-only routing; it is independent of payment and fiscal documents.
  if (options.troca && !shared)
    tasks.push({
      kind: 'exchange',
      title: `TROCA: Separação de pedido - ${options.client}`,
      instructions: 'Atenção: pedido de troca.',
      assigneeId: '',
      assigneeIds: [],
      sector: 'financeiro',
    });
  return { ok: true, tasks };
}
