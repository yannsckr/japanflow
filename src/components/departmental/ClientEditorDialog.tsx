import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AddressAutocomplete from './AddressAutocomplete';
import { toast } from 'sonner';

export type ClientForm = {
  companyName: string;
  contactPerson: string;
  phone: string;
  address: string;
  clientType: 'pf' | 'pj';
};
export const emptyClientForm: ClientForm = {
  companyName: '',
  contactPerson: '',
  phone: '',
  address: '',
  clientType: 'pj',
};

/** Formulário único: Departamental > Clientes e Novo Pedido utilizam o mesmo popup. */
export default function ClientEditorDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ClientForm | null;
  onSave: (form: ClientForm) => Promise<void>;
}) {
  const [form, setForm] = useState<ClientForm>(emptyClientForm);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm(initial || emptyClientForm);
  }, [open, initial]);
  const save = async () => {
    if (!form.companyName.trim() || !form.address.trim()) {
      toast.error('Preencha nome e endereço.');
      return;
    }
    setBusy(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } catch (error) {
      console.error('[Clientes] Erro ao salvar:', error);
      toast.error('Não foi possível salvar o cliente. Confira as permissões.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
          <DialogDescription>
            Os dados ficam disponíveis para consulta em tarefas e pedidos.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Tipo de cliente</Label>
            <Select
              value={form.clientType}
              onValueChange={(v) => setForm((old) => ({ ...old, clientType: v as 'pf' | 'pj' }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pf">Pessoa física</SelectItem>
                <SelectItem value="pj">Pessoa jurídica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>{form.clientType === 'pj' ? 'Nome da empresa' : 'Nome completo'}</Label>
            <Input
              maxLength={180}
              value={form.companyName}
              onChange={(e) => setForm((old) => ({ ...old, companyName: e.target.value }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Responsável / Contato (opcional)</Label>
            <Input
              maxLength={180}
              value={form.contactPerson}
              onChange={(e) => setForm((old) => ({ ...old, contactPerson: e.target.value }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Telefone (opcional)</Label>
            <Input
              maxLength={40}
              value={form.phone}
              onChange={(e) => setForm((old) => ({ ...old, phone: e.target.value }))}
            />
          </div>
          <AddressAutocomplete
            label="Endereço completo"
            required
            value={form.address}
            onChange={(address) => setForm((old) => ({ ...old, address }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="button" disabled={busy} onClick={save}>
              {busy ? 'Salvando...' : initial ? 'Salvar alterações' : 'Cadastrar cliente'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
