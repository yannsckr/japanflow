import { useMemo, useState } from 'react';
import { Building2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { DepartmentalClient } from '@/hooks/useDepartmental';

type Props = {
  clients: DepartmentalClient[];
  onSelect: (client: DepartmentalClient) => void;
  label?: string;
};
/** Busca reutilizável, sem gravar diretamente. Apenas preenche dados quando o usuário seleciona. */
export default function ClientLookup({
  clients,
  onSelect,
  label = 'Buscar cliente cadastrado',
}: Props) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const options = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    if (!q) return [];
    return clients
      .filter((c) =>
        [c.companyName, c.contactPerson, c.phone, c.address].some((value) =>
          (value || '').toLocaleLowerCase('pt-BR').includes(q)
        )
      )
      .slice(0, 8);
  }, [clients, query]);
  return (
    <div className="relative space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Building2 className="h-3.5 w-3.5 text-primary" />
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="h-9 pl-9"
          value={query}
          onFocus={() => setExpanded(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setExpanded(true);
          }}
          placeholder="Nome, telefone ou endereço"
        />
      </div>
      {expanded && query.trim() && (
        <div
          className="max-h-44 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
          role="listbox"
          aria-label="Clientes encontrados"
        >
          {options.length ? (
            options.map((client) => (
              <button
                key={client.id}
                type="button"
                role="option"
                aria-selected={false}
                className="block w-full rounded-md p-2 text-left text-xs hover:bg-accent"
                onClick={() => {
                  onSelect(client);
                  setQuery(client.companyName);
                  setExpanded(false);
                }}
              >
                <span className="font-semibold">{client.companyName}</span>
                <span className="block truncate text-muted-foreground">{client.address}</span>
              </button>
            ))
          ) : (
            <p className="p-2 text-xs text-muted-foreground">Nenhum cliente encontrado.</p>
          )}
        </div>
      )}
    </div>
  );
}
