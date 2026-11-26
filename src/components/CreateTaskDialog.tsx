import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useTaskPermissions } from '@/hooks/useTaskPermissions';
import { canCreateTasksForAll } from '@/lib/taskCreateAccess';
import { isCarolRecipient } from '@/lib/taskRecipientAccess';
import { planOrderFinance } from '@/lib/orderFinancePlan';
import { Priority, Sector, SECTOR_LABELS } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  ImagePlus,
  X,
  Package,
  ScanText,
  Loader2,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';

import app, { db } from '@/lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { uploadImage } from '@/lib/uploadImage';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { transcribeImageApi } from '@/lib/api';
import ClientEditorDialog, { type ClientForm } from '@/components/departmental/ClientEditorDialog';
import AddressAutocomplete from '@/components/departmental/AddressAutocomplete';
import type { DepartmentalClient } from '@/hooks/useDepartmental';
import { Checkbox } from '@/components/ui/checkbox';

interface CreateTaskDialogProps {
  preselectedAssignee?: string;
  mode?: 'task' | 'order';
}

const CreateTaskDialog = ({ preselectedAssignee, mode = 'task' }: CreateTaskDialogProps) => {
  const { currentUser, users, sectorAssignEnabled } = useApp();
  const { permissions, loading: permissionsLoading } = useTaskPermissions();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientAddress, setClientAddress] = useState('');
  const [clientAddressPlaceId, setClientAddressPlaceId] = useState<string | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryAddressPlaceId, setDeliveryAddressPlaceId] = useState<string | null>(null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientCreatorOpen, setClientCreatorOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [clients, setClients] = useState<DepartmentalClient[]>([]);
  const [clientReadError, setClientReadError] = useState(false);
  const titleForTask = mode === 'order' ? `Separação de pedido - ${clientName.trim()}` : title;

  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [assigneeId, setAssigneeId] = useState(preselectedAssignee || '');
  const [deadline, setDeadline] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [assignMode, setAssignMode] = useState<'employee' | 'sector'>(
    preselectedAssignee ? 'employee' : 'employee'
  );
  const [sector, setSector] = useState<Sector | ''>('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const submitting = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [paymentProofFiles, setPaymentProofFiles] = useState<File[]>([]);
  const [paymentProofPreviews, setPaymentProofPreviews] = useState<string[]>([]);
  const paymentProofInputRef = useRef<HTMLInputElement>(null);

  // Order picking (separação de pedido) states
  const [isSeparacao, setIsSeparacao] = useState(false);
  const [isTroca, setIsTroca] = useState<'sim' | 'nao' | ''>('');
  const [pagamento, setPagamento] = useState<'pago' | 'nao_pago' | ''>('');
  const [usarCreditos, setUsarCreditos] = useState(false);
  const [boleto, setBoleto] = useState<'com' | 'sem' | ''>('');
  const [maquininha, setMaquininha] = useState<'sim' | 'nao' | ''>('');
  const [emissaoNF, setEmissaoNF] = useState<'sim' | 'nao' | ''>('');
  const [formaEntrega, setFormaEntrega] = useState<
    'motoboy' | 'correios' | 'transportadora' | 'balcao' | 'uber' | ''
  >('');
  const [modalidadeCorreios, setModalidadeCorreios] = useState<'sedex' | 'pac' | ''>('');
  const [transportadora, setTransportadora] = useState<string>(''); // carrier name, '' or 'outros'
  const [transportadoraOutros, setTransportadoraOutros] = useState('');
  const [enderecoDiferente, setEnderecoDiferente] = useState(false);
  const effectiveDeliveryAddress = enderecoDiferente
    ? deliveryAddress.trim()
    : clientAddress.trim();
  const [carriers, setCarriers] = useState<{ id: string; name: string; blocked: boolean }[]>([]);

  useEffect(() => {
    const carriersQuery = query(collection(db, 'carriers'), orderBy('name', 'asc'));

    const unsubscribe = onSnapshot(
      carriersQuery,
      (snapshot) => {
        setCarriers(
          snapshot.docs.map((carrierDoc) => {
            const data = carrierDoc.data();
            return {
              id: carrierDoc.id,
              name: data.name || '',
              blocked: data.blocked === true,
            };
          })
        );
      },
      (error) => {
        console.error('Erro ao carregar transportadoras:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!open || mode !== 'order') return;
    const clientQueryRef = query(
      collection(db, 'departmental_clients'),
      orderBy('created_at', 'desc')
    );
    return onSnapshot(
      clientQueryRef,
      (snapshot) => {
        setClientReadError(false);
        setClients(
          snapshot.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              clientType: data.client_type === 'pf' ? ('pf' as const) : ('pj' as const),
              companyName: String(data.company_name || ''),
              contactPerson: String(data.contact_person || ''),
              phone: String(data.phone || ''),
              address: String(data.address || ''),
              distanceFromStoreMeters:
                typeof data.distance_from_store_meters === 'number'
                  ? data.distance_from_store_meters
                  : null,
              createdAt: '',
            };
          })
        );
      },
      (error) => {
        console.error('[Novo Pedido] Erro ao consultar clientes', error);
        setClientReadError(true);
      }
    );
  }, [open, mode]);

  const chooseClient = (client: DepartmentalClient) => {
    setClientId(client.id);
    setClientName(client.companyName);
    setClientAddress(client.address);
    setClientAddressPlaceId(null);
    setClientPickerOpen(false);
    setClientQuery('');
  };

  const registerClient = async (form: ClientForm) => {
    // Cadastro validado e distancia calculada pelo backend (sem escrita direta).
    const saveClient = httpsCallable<
      {
        action: string;
        companyName: string;
        clientType: string;
        contactPerson: string;
        phone: string;
        address: string;
      },
      { clientId: string; distanceMeters: number }
    >(getFunctions(app, 'southamerica-east1'), 'googleRoutePlanner');
    const result = await saveClient({
      action: 'saveClientWithDistance',
      companyName: form.companyName.trim(),
      clientType: form.clientType,
      contactPerson: form.contactPerson.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
    });
    if (!result.data.clientId) throw new Error('Cliente nao retornou identificador.');
    setClientId(result.data.clientId);
    setClientName(form.companyName.trim());
    setClientAddress(form.address.trim());
    setClientAddressPlaceId(null);
    toast.success('Cliente cadastrado e selecionado.');
  };

  const activeCarriers = useMemo(() => carriers.filter((c) => !c.blocked), [carriers]);
  const [ocrImage, setOcrImage] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  const isOrderDialog = mode === 'order';
  const isAdmin = currentUser?.role === 'admin';
  const canCreateForAll = canCreateTasksForAll(currentUser);

  const userPermissions = currentUser
    ? permissions.filter((p) => p.granterId === currentUser.id)
    : [];
  const allowedEmployeeIds = userPermissions
    .filter((p) => p.targetType === 'employee')
    .map((p) => p.targetValue);
  const allowedSectors = userPermissions
    .filter((p) => p.targetType === 'sector')
    .map((p) => p.targetValue);

  // Carol pode receber tarefas de qualquer colaborador ativo. A exceção é
  // somente para o destino Carol: não amplia os demais destinatários/setores.
  const carolRecipients = users.filter(isCarolRecipient);
  const assignableUsers = canCreateForAll
    ? users.filter((u) => (u.role === 'employee' || u.role === 'admin') && u.active !== false)
    : users.filter(
        (u) =>
          u.active !== false &&
          (allowedEmployeeIds.includes(u.id) ||
            (currentUser?.active === true && isCarolRecipient(u)))
      );

  const assignableSectors = canCreateForAll
    ? (Object.keys(SECTOR_LABELS) as Sector[])
    : (Object.keys(SECTOR_LABELS) as Sector[]).filter((s) => allowedSectors.includes(s));

  const hasEmployeePerms =
    canCreateForAll ||
    allowedEmployeeIds.length > 0 ||
    (currentUser?.active === true && carolRecipients.length > 0);
  const hasSectorPerms = sectorAssignEnabled && (canCreateForAll || allowedSectors.length > 0);
  const hasAnyPerms = hasEmployeePerms || hasSectorPerms;
  const isWilliam =
    currentUser?.id === 'emp-12' ||
    currentUser?.username?.trim().toLowerCase().replace(/_+$/, '') === 'william';
  // V45.4: permissao de pedidos independente das permissoes de delegar tarefas.
  // Somente colaboradores ativos de Vendas ou usuarios com permissao previa.
  const isActiveSalesUser =
    currentUser?.active !== false &&
    currentUser?.sectors?.some((value) => String(value).trim().toLowerCase() === 'vendas') === true;
  const mayCreateOrder =
    !isWilliam &&
    (isActiveSalesUser || (hasSectorPerms && assignableSectors.includes('expedicao' as Sector)));

  const effectiveAssignMode = isOrderDialog
    ? 'sector'
    : preselectedAssignee
      ? 'employee'
      : hasEmployeePerms && hasSectorPerms
        ? assignMode
        : hasSectorPerms
          ? 'sector'
          : 'employee';

  // Determine if target is expedição
  const isTargetingExpedicao = useMemo(() => {
    if (isOrderDialog) return mayCreateOrder;
    if (effectiveAssignMode === 'sector' && sector === 'expedicao') return true;
    if (effectiveAssignMode === 'employee' && assigneeId) {
      const assignee = users.find((u) => u.id === assigneeId);
      if (assignee?.sectors?.includes('expedicao' as Sector)) return true;
    }
    return false;
  }, [isOrderDialog, mayCreateOrder, effectiveAssignMode, sector, assigneeId, users]);

  // A modalidade Pedido reutiliza o fluxo de separacao existente.
  // Não cria um segundo fluxo de tarefas/Functions.
  useEffect(() => {
    if (isOrderDialog && open && isTargetingExpedicao) setIsSeparacao(true);
  }, [isOrderDialog, isTargetingExpedicao, open]);

  // Reset separação fields when not targeting expedição
  const resetSeparacaoFields = () => {
    setIsSeparacao(false);
    setIsTroca('');
    setPagamento('');
    setUsarCreditos(false);
    setBoleto('');
    setMaquininha('');
    setEmissaoNF('');
    setFormaEntrega('');
    setModalidadeCorreios('');
    setTransportadora('');
    setTransportadoraOutros('');
    setEnderecoDiferente(false);
    setOcrImage(null);
    setPaymentProofFiles([]);
    setPaymentProofPreviews([]);
  };

  const handleImageSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Apenas imagens são permitidas');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem deve ter no máximo 5MB');
      return;
    }

    setImageFiles((prev) => {
      if (prev.length >= 10) {
        toast.error('Máximo de 10 imagens por tarefa');
        return prev;
      }
      return [...prev, file];
    });

    const reader = new FileReader();
    reader.onload = (e) => setImagePreviews((prev) => [...prev, e.target?.result as string]);
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) handleImageSelect(file);
          break;
        }
      }
    },
    [handleImageSelect]
  );

  const removeImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProofSelect = (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      toast.error('Apenas imagens ou PDF são permitidos');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo deve ter no máximo 10MB');
      return;
    }
    setPaymentProofFiles((prev) => [...prev, file]);
    if (isImage) {
      const reader = new FileReader();
      reader.onload = (e) =>
        setPaymentProofPreviews((prev) => [...prev, e.target?.result as string]);
      reader.readAsDataURL(file);
    } else {
      setPaymentProofPreviews((prev) => [...prev, '__pdf__']);
    }
  };

  const handleProofPaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) handleProofSelect(file);
        break;
      }
    }
  }, []);

  const removeProof = (index: number) => {
    setPaymentProofFiles((prev) => prev.filter((_, i) => i !== index));
    setPaymentProofPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFilesList = async (files: File[]): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      try {
        const { publicUrl } = await uploadImage(file, {
          pathPrefix: 'tasks',
          sourceTable: 'tasks',
          sourceField: 'image_urls',
          uploadedBy: currentUser?.id,
        });
        urls.push(publicUrl);
      } catch (err) {
        console.error('Upload error:', err);
        toast.error('Erro ao enviar arquivo');
      }
    }
    return urls;
  };

  const uploadImages = async (): Promise<string[]> => uploadFilesList(imageFiles);
  const uploadPaymentProofs = async (): Promise<string[]> => uploadFilesList(paymentProofFiles);

  const handleOcrPaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        e.stopPropagation();
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const base64 = ev.target?.result as string;
          setOcrImage(base64);
          setOcrLoading(true);
          try {
            const resp = await transcribeImageApi({ imageBase64: base64 });
            const transcribed = resp.text || '';
            setDescription((prev) => (prev ? `${prev}\n\n${transcribed}` : transcribed));
            toast.success('Texto transcrito com sucesso!');
          } catch (err) {
            console.error('OCR error:', err);
            toast.error('Erro ao transcrever imagem');
          } finally {
            setOcrLoading(false);
          }
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  }, []);

  const ENDERECO_BANNER =
    '🚨🚨🚨 ENDEREÇO DE ENVIO DIFERENTE DO CADASTRO 🚨🚨🚨\n=========================================\n⚠️ ATENÇÃO: CONFERIR ENDEREÇO DE ENVIO ⚠️\n=========================================';

  const buildSeparacaoDescription = () => {
    if (!isSeparacao) return description;
    const parts: string[] = [];
    if (enderecoDiferente) parts.push(ENDERECO_BANNER);
    parts.push(description);
    parts.push('\n📦 SEPARAÇÃO DE PEDIDO');
    if (enderecoDiferente) parts.push('🚨 ENDEREÇO DE ENVIO DIFERENTE DO CADASTRO');
    if (isOrderDialog) {
      parts.push(`👤 Cliente: ${clientName.trim()}`);
      parts.push(`📍 Endereço de cadastro: ${clientAddress.trim()}`);
      parts.push(`🚚 Destino da entrega: ${effectiveDeliveryAddress}`);
    }
    if (isTroca) parts.push(`🔄 ${isTroca === 'sim' ? 'TROCA' : 'NÃO É TROCA'}`);
    if (pagamento) parts.push(`💰 ${pagamento === 'pago' ? 'Pago' : 'Não Pago'}`);
    if (pagamento === 'pago' && usarCreditos) parts.push('🪙 USAR CRÉDITOS');
    if (boleto) parts.push(`📄 ${boleto === 'com' ? 'COM Boleto' : 'SEM Boleto'}`);
    if (emissaoNF)
      parts.push(`🧾 ${emissaoNF === 'sim' ? 'COM Emissão de NF' : 'SEM Emissão de NF'}`);
    if (maquininha)
      parts.push(`💳 ${maquininha === 'sim' ? 'Levar Maquininha' : 'Sem Maquininha'}`);
    if (formaEntrega) {
      const labels: Record<string, string> = {
        motoboy: '🏍️ Motoboy',
        correios: '📮 Correios',
        transportadora: '🚛 Transportadora',
        balcao: '🏪 Balcão',
        uber: '🚗 Uber',
      };
      parts.push(`🚚 Entrega: ${labels[formaEntrega] || formaEntrega}`);
    }
    if (modalidadeCorreios) {
      parts.push(`📬 Modalidade: ${modalidadeCorreios === 'sedex' ? 'SEDEX' : 'PAC'}`);
    }
    if (formaEntrega === 'transportadora' && transportadora) {
      const transpLabel =
        transportadora === 'outros' ? transportadoraOutros || 'Outros' : transportadora;
      parts.push(`🚛 Transportadora: ${transpLabel}`);
    }
    return parts.filter(Boolean).join('\n');
  };

  const buildOrderInfoNotes = () => {
    // Structured notes for parsing in motoboy/corridas views
    const tags: string[] = [];
    if (enderecoDiferente) tags.push('ENDERECO_DIFERENTE');
    if (isTroca === 'sim') tags.push('TROCA');
    if (isTroca === 'nao') tags.push('NAO_TROCA');
    if (pagamento === 'pago') tags.push('PAGO');
    if (pagamento === 'pago' && usarCreditos) tags.push('USAR_CREDITOS');
    if (pagamento === 'nao_pago') tags.push('NAO_PAGO');
    if (maquininha === 'sim') tags.push('MAQUININHA');
    if (maquininha === 'nao') tags.push('SEM_MAQUININHA');
    if (emissaoNF === 'sim') tags.push('NF');
    if (emissaoNF === 'nao') tags.push('SEM_NF');
    if (boleto === 'com') tags.push('BOLETO');
    if (boleto === 'sem') tags.push('SEM_BOLETO');
    return tags.length ? `[INFO:${tags.join(',')}]` : '';
  };

  const handleSubmit = async () => {
    if (submitting.current) return;
    if (isOrderDialog && !clientName.trim()) {
      toast.error('Informe o nome do cliente.');
      return;
    }
    if (isOrderDialog && enderecoDiferente && !deliveryAddress.trim()) {
      toast.error('Informe o endereço de envio diferente.');
      return;
    }
    if (!titleForTask || !currentUser) return;
    if (isOrderDialog && (!isTargetingExpedicao || !isSeparacao)) {
      toast.error('Pedido precisa ser destinado a Expedicao e marcado como separacao.');
      return;
    }
    if (!isOrderDialog && effectiveAssignMode === 'employee' && !assigneeId) return;
    if (
      !isOrderDialog &&
      effectiveAssignMode === 'employee' &&
      !assignableUsers.some((user) => user.id === assigneeId)
    ) {
      toast.error('Destinatário indisponível ou sem permissão de envio.');
      return;
    }
    if (effectiveAssignMode === 'sector' && !(isOrderDialog ? 'expedicao' : sector)) return;

    // Require payment proof when separação de pedido marked as PAGO,
    // exceto quando o cliente for usar créditos (comprovante é opcional)
    if (isSeparacao && pagamento === 'pago' && !usarCreditos && paymentProofFiles.length === 0) {
      toast.error('Anexe o comprovante de pagamento (imagem ou PDF)');
      return;
    }

    // Resolve all mandatory finance recipients before uploading or creating any task.
    const finance = planOrderFinance(users, {
      separation: isSeparacao,
      paid: pagamento === 'pago',
      nf: emissaoNF === 'sim',
      boleto: boleto === 'com',
      troca: isTroca === 'sim',
      client: isOrderDialog ? clientName.trim() : titleForTask,
    });
    if (finance.ok === false) {
      toast.error(finance.error);
      return;
    }
    submitting.current = true;
    setUploading(true);
    const notifications: { userId: string; taskId: string; message: string }[] = [];
    let savedTaskId = '';
    let savedMotoboyOrder = false;
    try {
      const uploadedUrls = await uploadImages();
      const proofUrls = isSeparacao && pagamento === 'pago' ? await uploadPaymentProofs() : [];
      if (
        uploadedUrls.length !== imageFiles.length ||
        (isSeparacao && pagamento === 'pago' && proofUrls.length !== paymentProofFiles.length)
      ) {
        throw new Error('Não foi possível enviar todos os anexos.');
      }
      const allImageUrls = [...uploadedUrls, ...proofUrls];
      const firstImageUrl = allImageUrls.length > 0 ? allImageUrls[0] : undefined;
      const fullDeadline = deadline && taskTime ? `${deadline} ${taskTime}` : deadline || '';
      let finalDescription = buildSeparacaoDescription();
      if (proofUrls.length > 0) {
        finalDescription += `\n\n💳 Comprovante(s) de Pagamento:\n${proofUrls.map((u) => `• ${u}`).join('\n')}`;
      }

      // Cria a tarefa principal no Firestore.
      const now = new Date().toISOString();
      const statusHistory = [{ status: 'todo', enteredAt: now }];

      // Pedido e corrida Motoboy devem nascer juntos: falha de permissao nao gera pedido orfao.
      const taskRef = doc(collection(db, 'tasks'));
      const createdTaskId = taskRef.id;
      const taskData = {
        board_visible: true,
        title: titleForTask,
        description: finalDescription,
        ...(isOrderDialog
          ? {
              client_id: clientId,
              client_name: clientName.trim(),
              client_address: clientAddress.trim(),
              delivery_address: effectiveDeliveryAddress,
              delivery_place_id: enderecoDiferente ? deliveryAddressPlaceId : clientAddressPlaceId,
              delivery_method: formaEntrega || null,
            }
          : {}),
        priority,
        assignee_id: isOrderDialog ? '' : effectiveAssignMode === 'employee' ? assigneeId : '',
        deadline: fullDeadline,
        status: 'todo',
        created_by: currentUser.id,
        sector: isOrderDialog
          ? ('expedicao' as Sector)
          : effectiveAssignMode === 'sector'
            ? (sector as Sector)
            : null,
        image_url: firstImageUrl || null,
        image_urls: allImageUrls,
        status_history: statusHistory,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      };
      const isMotoboyOrder = isSeparacao && formaEntrega === 'motoboy';
      const batch = writeBatch(db);
      batch.set(taskRef, taskData);
      if (isMotoboyOrder) {
        const separacaoDetails = [
          pagamento === 'pago' ? '💰 Pago' : pagamento === 'nao_pago' ? '💰 Não Pago' : '',
          boleto === 'com' ? '📄 COM Boleto' : boleto === 'sem' ? '📄 SEM Boleto' : '',
          emissaoNF === 'sim' ? '🧾 COM NF' : emissaoNF === 'nao' ? '🧾 SEM NF' : '',
          maquininha === 'sim'
            ? '💳 Levar Maquininha'
            : maquininha === 'nao'
              ? '💳 Sem Maquininha'
              : '',
        ]
          .filter(Boolean)
          .join(' | ');
        const infoTag = buildOrderInfoNotes();
        const fullNotes = [separacaoDetails, infoTag].filter(Boolean).join(' ');
        const createdRideRef = doc(db, 'motoboy_assignments', `order_${createdTaskId}`);
        const rideData = {
          description: enderecoDiferente
            ? `🚨 ENDEREÇO DIFERENTE - Entrega: ${titleForTask}`
            : `Entrega: ${titleForTask}`,
          assigned_to: null,
          assigned_by: currentUser.id,
          ride_value: 15,
          client_name: clientName.trim(),
          location: effectiveDeliveryAddress,
          notes: fullNotes,
          status: 'pending',
          task_id: null, // somente criar task do motoboy ao designar; nao vincular a tarefa de separacao
          source_order_task_id: taskRef.id,
          created_at: Timestamp.now(),
          updated_at: Timestamp.now(),
        };
        batch.set(createdRideRef, rideData);
      }
      // If separação with Transportadora, create a personal task for Patricia (emp-1)
      if (isSeparacao && formaEntrega === 'transportadora' && currentUser) {
        const transpLabel =
          transportadora === 'outros'
            ? transportadoraOutros?.trim() || 'Outros'
            : transportadora || 'Outros';
        const patriciaTaskDesc = [
          enderecoDiferente ? ENDERECO_BANNER : '',
          `Transportadora: ${transpLabel}`,
          `Pedido: ${titleForTask}`,
          pagamento === 'pago' ? '💰 Pago' : pagamento === 'nao_pago' ? '💰 Não Pago' : '',
          boleto === 'com' ? '📄 COM Boleto' : boleto === 'sem' ? '📄 SEM Boleto' : '',
          emissaoNF === 'sim' ? '🧾 COM NF' : emissaoNF === 'nao' ? '🧾 SEM NF' : '',
          maquininha === 'sim'
            ? '💳 Levar Maquininha'
            : maquininha === 'nao'
              ? '💳 Sem Maquininha'
              : '',
          description ? `Obs: ${description}` : '',
          enderecoDiferente ? '[INFO:ENDERECO_DIFERENTE]' : '',
        ]
          .filter(Boolean)
          .join('\n');
        const deadlinePatricia = new Date();
        deadlinePatricia.setHours(23, 59, 59, 999);
        const patStatusHistory = [{ status: 'todo', enteredAt: new Date().toISOString() }];
        const transportTaskRef = doc(collection(db, 'tasks'));
        batch.set(transportTaskRef, {
          board_visible: true,
          title: `${enderecoDiferente ? '🚨 ENDEREÇO DIFERENTE - ' : ''}🚛 Transportadora ${transpLabel}: ${titleForTask}`,
          description: patriciaTaskDesc,
          status: 'todo',
          priority: 'medium',
          assignee_id: 'emp-1',
          created_by: currentUser.id,
          deadline: deadlinePatricia.toISOString().split('T')[0],
          sector: null,
          status_history: patStatusHistory,
          image_url: firstImageUrl || null,
          image_urls: uploadedUrls,
          created_at: Timestamp.now(),
          updated_at: Timestamp.now(),
        });
        notifications.push({
          userId: 'emp-1',
          taskId: transportTaskRef.id,
          message: `Transportadora ${transpLabel}: ${titleForTask}`,
        });
      }

      // If separação with Balcão OR Transportadora "PH Transportes", create a pickup entry
      if (isSeparacao && currentUser) {
        const isBalcao = formaEntrega === 'balcao';
        const transpLabelPickup =
          transportadora === 'outros' ? transportadoraOutros?.trim() || '' : transportadora || '';
        const isPH =
          formaEntrega === 'transportadora' &&
          transpLabelPickup.toLowerCase().includes('ph transportes');
        if (isBalcao || isPH) {
          const pickupDetails = [
            enderecoDiferente ? ENDERECO_BANNER : '',
            pagamento === 'pago' ? '💰 Pago' : pagamento === 'nao_pago' ? '💰 Não Pago' : '',
            boleto === 'com' ? '📄 COM Boleto' : boleto === 'sem' ? '📄 SEM Boleto' : '',
            emissaoNF === 'sim' ? '🧾 COM NF' : emissaoNF === 'nao' ? '🧾 SEM NF' : '',
            maquininha === 'sim'
              ? '💳 Levar Maquininha'
              : maquininha === 'nao'
                ? '💳 Sem Maquininha'
                : '',
            description ? `Obs: ${description}` : '',
            enderecoDiferente ? '[INFO:ENDERECO_DIFERENTE]' : '',
          ]
            .filter(Boolean)
            .join('\n');
          batch.set(doc(collection(db, 'pickups')), {
            order_title: titleForTask,
            delivery_type: isBalcao ? 'balcao' : 'transportadora',
            carrier_name: isBalcao ? null : transpLabelPickup,
            details: pickupDetails || null,
            task_id: null, // somente criar task do motoboy ao designar; nao vincular a tarefa de separacao
            created_by: currentUser.id,
            status: 'pending',
            created_at: Timestamp.now(),
            updated_at: Timestamp.now(),
          });
        }
      }

      // If separação with Correios delivery, create a task for William to generate shipping label
      if (isSeparacao && formaEntrega === 'correios' && modalidadeCorreios && currentUser) {
        const modalLabel = modalidadeCorreios === 'sedex' ? 'SEDEX' : 'PAC';
        const williamTaskDesc = [
          enderecoDiferente ? ENDERECO_BANNER : '',
          `Gerar etiqueta de envio via ${modalLabel}`,
          `Pedido: ${titleForTask}`,
          ...(isOrderDialog
            ? [
                `Cliente: ${clientName.trim()}`,
                `Endereço de entrega: ${effectiveDeliveryAddress}`,
                `Endereço cadastrado: ${clientAddress.trim()}`,
              ]
            : []),
          pagamento === 'pago' ? '💰 Pago' : pagamento === 'nao_pago' ? '💰 Não Pago' : '',
          emissaoNF === 'sim'
            ? '🧾 COM Emissão de NF'
            : emissaoNF === 'nao'
              ? '🧾 SEM Emissão de NF'
              : '',
          boleto === 'com' ? '📄 COM Boleto' : boleto === 'sem' ? '📄 SEM Boleto' : '',
          description ? `Obs: ${description}` : '',
          `[INFO:${[
            enderecoDiferente ? 'ENDERECO_DIFERENTE' : '',
            pagamento === 'pago' ? 'PAGO' : pagamento === 'nao_pago' ? 'NAO_PAGO' : '',
            emissaoNF === 'sim' ? 'NF' : emissaoNF === 'nao' ? 'SEM_NF' : '',
            boleto === 'com' ? 'BOLETO' : boleto === 'sem' ? 'SEM_BOLETO' : '',
          ]
            .filter(Boolean)
            .join(',')}]`,
        ]
          .filter(Boolean)
          .join('\n');
        const deadlineForWilliam = new Date();
        deadlineForWilliam.setHours(23, 59, 59, 999);
        const statusHistory = [{ status: 'todo', enteredAt: new Date().toISOString() }];
        const labelTaskRef = doc(collection(db, 'tasks'));
        batch.set(labelTaskRef, {
          board_visible: true,
          title: `${enderecoDiferente ? '🚨 ENDEREÇO DIFERENTE - ' : ''}📮 Etiqueta ${modalLabel}: ${titleForTask}`,
          description: williamTaskDesc,
          status: 'todo',
          priority: 'high',
          assignee_id: 'emp-12',
          created_by: currentUser.id,
          deadline: deadlineForWilliam.toISOString().split('T')[0],
          sector: 'expedicao',
          status_history: statusHistory,
          image_url: firstImageUrl || null,
          image_urls: uploadedUrls,
          created_at: Timestamp.now(),
          updated_at: Timestamp.now(),
        });
        notifications.push({
          userId: 'emp-12',
          taskId: labelTaskRef.id,
          message: `Etiqueta ${modalLabel}: ${titleForTask}`,
        });
      }

      // Finance and shipping tasks are committed together with the main order.
      // A paid order has a separate low-level cash reconciliation task for Carol.
      const financeDeadline = new Date();
      financeDeadline.setHours(23, 59, 59, 999);
      for (const item of finance.tasks) {
        const financeRef = doc(collection(db, 'tasks'));
        const financeTitle =
          item.kind === 'payment'
            ? item.title
            : `${enderecoDiferente ? '🚨 ENDEREÇO DIFERENTE - ' : ''}${item.title}`;
        batch.set(financeRef, {
          board_visible: true,
          title: financeTitle,
          description: [
            item.instructions,
            `Pedido: ${titleForTask}`,
            finalDescription,
            buildOrderInfoNotes(),
          ]
            .filter(Boolean)
            .join('\n\n'),
          ...(isOrderDialog
            ? {
                client_id: clientId,
                client_name: clientName.trim(),
                client_address: clientAddress.trim(),
                delivery_address: effectiveDeliveryAddress,
                delivery_place_id: enderecoDiferente
                  ? deliveryAddressPlaceId
                  : clientAddressPlaceId,
              }
            : {}),
          source_order_task_id: taskRef.id,
          status: 'todo',
          priority: 'high',
          assignee_id: item.assigneeId,
          ...(item.assigneeIds.length ? { assignee_ids: item.assigneeIds } : {}),
          created_by: currentUser.id,
          deadline: financeDeadline.toISOString().split('T')[0],
          sector: item.sector,
          status_history: statusHistory,
          image_url: proofUrls[0] || firstImageUrl || null,
          image_urls: [...proofUrls, ...uploadedUrls],
          created_at: Timestamp.now(),
          updated_at: Timestamp.now(),
        });
        for (const userId of new Set([item.assigneeId, ...item.assigneeIds].filter(Boolean))) {
          notifications.push({
            userId,
            taskId: financeRef.id,
            message: `Nova tarefa atribuída: ${financeTitle}`,
          });
        }
      }
      if (!isOrderDialog && effectiveAssignMode === 'employee' && assigneeId) {
        notifications.push({
          userId: assigneeId,
          taskId: createdTaskId,
          message: `Nova tarefa atribuída: ${titleForTask}`,
        });
      }
      await batch.commit();
      savedTaskId = createdTaskId;
      savedMotoboyOrder = isMotoboyOrder;
    } catch (error) {
      console.error('[Novo Pedido] Falha ao enviar pedido:', error);
      toast.error(
        'Não foi possível confirmar o envio. Confira a conexão e os anexos antes de tentar novamente.'
      );
      return;
    } finally {
      // Keep submission locked until post-commit state is reset below; unlock on failure.
      if (!savedTaskId) {
        submitting.current = false;
        setUploading(false);
      }
    }

    // Commit succeeded. Notification or distance failures must never retry the order.
    const createdTaskId = savedTaskId;
    const isMotoboyOrder = savedMotoboyOrder;
    void Promise.allSettled(
      notifications.map(async (notification) =>
        writeBatch(db)
          .set(doc(collection(db, 'notifications')), {
            user_id: notification.userId,
            userId: notification.userId,
            taskId: notification.taskId,
            message: notification.message,
            type: 'task_created',
            read: false,
            created_at: Timestamp.now(),
            createdAt: new Date().toISOString(),
          })
          .commit()
      )
    ).then((results) => {
      if (results.some((result) => result.status === 'rejected')) {
        toast.warning('Pedido salvo, mas uma ou mais notificações não foram enviadas.');
      }
    });
    // A corrida Motoboy ja foi salva atomicamente com o pedido.
    if (isMotoboyOrder) {
      const createdRideRef = doc(db, 'motoboy_assignments', `order_${createdTaskId}`);
      if (effectiveDeliveryAddress.trim()) {
        const estimate = httpsCallable<{ action: string; rideId: string }, unknown>(
          getFunctions(app, 'southamerica-east1'),
          'googleRoutePlanner'
        );
        void estimate({ action: 'estimateRideAndPersist', rideId: createdRideRef.id }).catch(
          (error) => console.warn('[pedido] km previsto nao calculado', error)
        );
      }
    }

    toast.success(isSeparacao ? 'Pedido e tarefas vinculadas salvos.' : 'Tarefa criada.');
    // Reset all fields
    setTitle('');
    setClientName('');
    setClientId(null);
    setClientAddress('');
    setClientAddressPlaceId(null);
    setDeliveryAddress('');
    setDeliveryAddressPlaceId(null);
    setDescription('');
    setPriority('medium');
    setAssigneeId(preselectedAssignee || '');
    setDeadline('');
    setTaskTime('');
    setSector('');
    setAssignMode(
      preselectedAssignee ? 'employee' : hasSectorPerms && !hasEmployeePerms ? 'sector' : 'employee'
    );
    setImageFiles([]);
    setImagePreviews([]);
    resetSeparacaoFields();
    submitting.current = false;
    setUploading(false);
    setOpen(false);
  };

  const isValid =
    (isOrderDialog ? clientName.trim() && (!enderecoDiferente || deliveryAddress.trim()) : title) &&
    (isOrderDialog
      ? mayCreateOrder
      : (effectiveAssignMode === 'employee' && assigneeId) ||
        (effectiveAssignMode === 'sector' && sector));

  if (permissionsLoading) return null;
  if (!isOrderDialog && !canCreateForAll && !hasAnyPerms && !preselectedAssignee) return null;
  if (isOrderDialog && !mayCreateOrder) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() =>
          toast.error('Você precisa de permissão para criar pedidos destinados à Expedição.')
        }
      >
        <Package className="h-4 w-4" />
        Novo Pedido
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && submitting.current) return;
        setOpen(v);
        if (!v) {
          resetSeparacaoFields();
        } else if (isOrderDialog) {
          // Pedidos são sempre separação destinada à Expedição, respeitando permissões.
          setAssignMode('sector');
          setSector('expedicao' as Sector);
          setAssigneeId('');
          setIsSeparacao(true);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={isOrderDialog ? 'outline' : 'default'} className="gap-1.5">
          {isOrderDialog ? <Package className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {isOrderDialog ? 'Novo Pedido' : 'Nova Tarefa'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] w-[min(96vw,1180px)] max-w-none overflow-y-auto rounded-2xl p-5 sm:max-w-none sm:p-7">
        <DialogHeader className="border-b border-border/70 pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {isOrderDialog ? <Package className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            </span>
            {isOrderDialog ? 'Criar Novo Pedido' : 'Criar Nova Tarefa'}
          </DialogTitle>
          {!isOrderDialog && (
            <DialogDescription className="pl-0 text-sm sm:pl-[52px]">
              Organize os detalhes, a prioridade e o responsável pela tarefa.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className={isOrderDialog ? 'mt-3 space-y-5' : 'mt-2 space-y-5'} onPaste={handlePaste}>
          <div
            className={
              isOrderDialog
                ? 'grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] xl:items-start'
                : 'grid gap-6 lg:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)]'
            }
          >
            <div className="min-w-0 space-y-4">
              {isOrderDialog && (
                <section className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="h-4 w-4 text-primary" />
                    Dados do cliente e entrega
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                    <div className="space-y-1.5 min-w-0">
                      <label className="text-xs font-medium">Cliente *</label>
                      <Input
                        value={clientName}
                        maxLength={180}
                        placeholder="Nome do cliente ou empresa"
                        onChange={(e) => {
                          setClientName(e.target.value);
                          setClientId(null);
                        }}
                      />
                    </div>

                    <Button
                      variant="outline"
                      type="button"
                      className="gap-1.5"
                      onClick={() => setClientPickerOpen(true)}
                    >
                      <Search className="h-4 w-4" />
                      Selecionar cliente
                    </Button>

                    <Button
                      type="button"
                      aria-label="Cadastrar novo cliente"
                      className="gap-1.5"
                      onClick={() => setClientCreatorOpen(true)}
                    >
                      <UserPlus className="h-4 w-4" />+
                    </Button>
                  </div>

                  <AddressAutocomplete
                    label="Endereço do cliente"
                    value={clientAddress}
                    onChange={(address, placeId) => {
                      setClientAddress(address);
                      setClientAddressPlaceId(placeId);
                    }}
                  />

                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <Checkbox
                      checked={enderecoDiferente}
                      onCheckedChange={(checked) => setEnderecoDiferente(checked === true)}
                    />
                    Endereço de envio diferente
                  </label>

                  {enderecoDiferente && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <AddressAutocomplete
                        label="Endereço de entrega (será usado nas rotas)"
                        value={deliveryAddress}
                        onChange={(address, placeId) => {
                          setDeliveryAddress(address);
                          setDeliveryAddressPlaceId(placeId);
                        }}
                      />
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground">
                    Título no Kanban:{' '}
                    <span className="font-medium text-foreground">{titleForTask}</span>
                  </p>
                </section>
              )}
              {!isOrderDialog && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Título</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Nome da tarefa"
                  />
                </div>
              )}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Descrição</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva a tarefa..."
                  className={isOrderDialog ? 'min-h-[220px] resize-y' : 'resize-y'}
                  rows={3}
                />
              </div>

              {/* Image upload - multiple */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Imagens (até 10, opcional)
                </label>
                {imagePreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {imagePreviews.map((preview, idx) => (
                      <div key={idx} className="relative inline-block">
                        <img
                          src={preview}
                          alt={`Preview ${idx + 1}`}
                          className="h-20 w-20 object-cover rounded-lg border border-border"
                        />
                        <button
                          onClick={() => removeImage(idx)}
                          className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {imageFiles.length < 10 && (
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="w-4 h-4" />
                      {imageFiles.length > 0
                        ? `Adicionar Mais (${imageFiles.length}/10)`
                        : 'Adicionar Imagem'}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ou cole uma imagem (Ctrl+V)
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          Array.from(e.target.files).forEach((f) => handleImageSelect(f));
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
            <div
              className={
                isOrderDialog
                  ? 'min-w-0 space-y-4 rounded-xl border border-border/70 bg-muted/10 p-4 sm:p-5 lg:self-start'
                  : 'min-w-0 space-y-4 lg:border-l lg:border-border/70 lg:pl-6'
              }
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Prioridade</label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">🔴 Alta</SelectItem>
                      <SelectItem value="medium">🟡 Média</SelectItem>
                      <SelectItem value="low">🟢 Baixa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Prazo (opcional)</label>
                  <Input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Horário (opcional)</label>
                <Input type="time" value={taskTime} onChange={(e) => setTaskTime(e.target.value)} />
              </div>
              {!isOrderDialog && !preselectedAssignee && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Atribuir a</label>
                  {hasEmployeePerms && hasSectorPerms ? (
                    <Tabs
                      value={assignMode}
                      onValueChange={(v) => {
                        setAssignMode(v as 'employee' | 'sector');
                        resetSeparacaoFields();
                      }}
                    >
                      <TabsList className="w-full mb-2">
                        <TabsTrigger value="employee" className="flex-1">
                          Funcionário
                        </TabsTrigger>
                        <TabsTrigger value="sector" className="flex-1">
                          Setor
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="employee">
                        <Select
                          value={assigneeId}
                          onValueChange={(v) => {
                            setAssigneeId(v);
                            resetSeparacaoFields();
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um funcionário" />
                          </SelectTrigger>
                          <SelectContent>
                            {assignableUsers.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TabsContent>
                      <TabsContent value="sector">
                        <Select
                          value={sector}
                          onValueChange={(v) => {
                            setSector(v as Sector);
                            resetSeparacaoFields();
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um setor" />
                          </SelectTrigger>
                          <SelectContent>
                            {assignableSectors.map((s) => (
                              <SelectItem key={s} value={s}>
                                {SECTOR_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Qualquer funcionário do setor poderá resgatar esta tarefa.
                        </p>
                      </TabsContent>
                    </Tabs>
                  ) : hasEmployeePerms ? (
                    <Select
                      value={assigneeId}
                      onValueChange={(v) => {
                        setAssigneeId(v);
                        resetSeparacaoFields();
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um funcionário" />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableUsers.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <>
                      <Select
                        value={sector}
                        onValueChange={(v) => {
                          setSector(v as Sector);
                          resetSeparacaoFields();
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um setor" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableSectors.map((s) => (
                            <SelectItem key={s} value={s}>
                              {SECTOR_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Qualquer funcionário do setor poderá resgatar esta tarefa.
                      </p>
                    </>
                  )}
                </div>
              )}
              {preselectedAssignee && <input type="hidden" value={assigneeId} />}
              {/* Separação de Pedido - only for expedição */}
              {isTargetingExpedicao && (
                <div className="min-w-0 space-y-4 rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" />
                      <label className="text-sm font-medium">Separação de Pedido</label>
                    </div>
                    <Switch
                      checked={isSeparacao}
                      disabled={isOrderDialog}
                      className={isOrderDialog ? 'data-[state=checked]:bg-primary opacity-100' : ''}
                      onCheckedChange={(v) => {
                        setIsSeparacao(v);
                        if (!v) {
                          setIsTroca('');
                          setPagamento('');
                          setBoleto('');
                          setMaquininha('');
                          setEmissaoNF('');
                          setFormaEntrega('');
                        }
                      }}
                    />
                  </div>

                  {isSeparacao && (
                    <div className="min-w-0 space-y-4 pt-1">
                      {/* Endereço diferente do cadastro - no Pedido fica no bloco de cliente */}
                      {!isOrderDialog && (
                        <div
                          className={cn(
                            'flex items-center justify-between rounded-md border-2 px-3 py-2 transition-colors',
                            enderecoDiferente
                              ? 'border-red-500 bg-red-500/10 ring-2 ring-red-500/40'
                              : 'border-border'
                          )}
                        >
                          <div className="flex flex-col pr-2">
                            <span
                              className={cn(
                                'text-sm font-semibold',
                                enderecoDiferente
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-foreground'
                              )}
                            >
                              🚨 Endereço de envio diferente do cadastro
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              Quando ativado, as tarefas geradas ficam destacadas em vermelho.
                            </span>
                          </div>
                          <Switch
                            checked={enderecoDiferente}
                            onCheckedChange={setEnderecoDiferente}
                          />
                        </div>
                      )}

                      <div className="flex min-w-0 flex-col gap-2">
                        {/* Troca */}
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                          <span className="text-sm text-foreground">Caso de Troca?</span>
                          <div className="flex min-w-0 flex-wrap gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={isTroca === 'sim' ? 'default' : 'outline'}
                              className="h-auto min-h-7 whitespace-normal px-2.5 py-1 text-xs"
                              onClick={() => setIsTroca(isTroca === 'sim' ? '' : 'sim')}
                            >
                              Sim
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={isTroca === 'nao' ? 'default' : 'outline'}
                              className="h-auto min-h-7 whitespace-normal px-2.5 py-1 text-xs"
                              onClick={() => setIsTroca(isTroca === 'nao' ? '' : 'nao')}
                            >
                              Não
                            </Button>
                          </div>
                        </div>

                        {/* Pagamento */}
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                          <span className="text-sm text-foreground">Pagamento</span>
                          <div className="flex min-w-0 flex-wrap gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={pagamento === 'pago' ? 'default' : 'outline'}
                              className="h-auto min-h-7 whitespace-normal px-2.5 py-1 text-xs"
                              onClick={() => setPagamento(pagamento === 'pago' ? '' : 'pago')}
                            >
                              Pago
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={pagamento === 'nao_pago' ? 'destructive' : 'outline'}
                              className="h-auto min-h-7 whitespace-normal px-2.5 py-1 text-xs"
                              onClick={() =>
                                setPagamento(pagamento === 'nao_pago' ? '' : 'nao_pago')
                              }
                            >
                              Não Pago
                            </Button>
                          </div>
                        </div>

                        {/* Usar Créditos - aparece quando PAGO */}
                        {pagamento === 'pago' && (
                          <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
                            <div className="flex min-w-0 flex-col break-words">
                              <span className="text-sm font-medium text-foreground">
                                🪙 Usar Créditos
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                Cliente irá abater com créditos. Comprovante torna-se opcional.
                              </span>
                            </div>
                            <Switch
                              checked={usarCreditos}
                              className="shrink-0"
                              onCheckedChange={(v) => setUsarCreditos(!!v)}
                            />
                          </div>
                        )}

                        {/* Comprovante de Pagamento - obrigatório quando PAGO, opcional se Usar Créditos */}
                        {pagamento === 'pago' && (
                          <div
                            className={`min-w-0 w-full rounded-md border px-3 py-2 space-y-2 ${
                              usarCreditos
                                ? 'border-border bg-muted/20'
                                : 'border-warning/40 bg-warning/5'
                            }`}
                          >
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                              <span className="min-w-0 break-words text-xs font-medium text-foreground">
                                💳 Comprovante de Pagamento{' '}
                                {usarCreditos ? (
                                  <span className="text-muted-foreground font-normal">
                                    (opcional)
                                  </span>
                                ) : (
                                  <span className="text-destructive">*</span>
                                )}
                              </span>
                              <div className="flex min-w-0 flex-wrap gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs px-2"
                                  onClick={() => paymentProofInputRef.current?.click()}
                                >
                                  <ImagePlus className="w-3 h-3 mr-1" /> Anexar
                                </Button>
                              </div>
                              <input
                                ref={paymentProofInputRef}
                                type="file"
                                accept="image/*,application/pdf"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                  const files = Array.from(e.target.files || []);
                                  files.forEach(handleProofSelect);
                                  if (paymentProofInputRef.current)
                                    paymentProofInputRef.current.value = '';
                                }}
                              />
                            </div>
                            <Textarea
                              placeholder="Cole aqui (Ctrl+V) uma imagem do comprovante ou clique em Anexar para enviar imagem/PDF"
                              className="min-h-[64px] w-full min-w-0 resize-none text-xs"
                              readOnly
                              onPaste={handleProofPaste}
                            />
                            {paymentProofPreviews.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {paymentProofPreviews.map((src, i) => (
                                  <div
                                    key={i}
                                    className="relative w-16 h-16 rounded border border-border overflow-hidden bg-muted flex items-center justify-center"
                                  >
                                    {src === '__pdf__' ? (
                                      <span className="text-[10px] text-muted-foreground px-1 text-center">
                                        📄 {paymentProofFiles[i]?.name.slice(0, 12) || 'PDF'}
                                      </span>
                                    ) : (
                                      <img
                                        src={src}
                                        alt={`comprovante ${i + 1}`}
                                        className="w-full h-full object-cover"
                                      />
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => removeProof(i)}
                                      className="absolute top-0 right-0 bg-destructive text-destructive-foreground rounded-bl px-1 text-[10px] leading-none"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Boleto */}
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                          <span className="text-sm text-foreground">Boleto</span>
                          <div className="flex min-w-0 flex-wrap gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={boleto === 'com' ? 'default' : 'outline'}
                              className="h-auto min-h-7 whitespace-normal px-2.5 py-1 text-xs"
                              onClick={() => setBoleto(boleto === 'com' ? '' : 'com')}
                            >
                              Com Boleto
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={boleto === 'sem' ? 'default' : 'outline'}
                              className="h-auto min-h-7 whitespace-normal px-2.5 py-1 text-xs"
                              onClick={() => setBoleto(boleto === 'sem' ? '' : 'sem')}
                            >
                              Sem Boleto
                            </Button>
                          </div>
                        </div>

                        {/* Emissão de NF (opcional) */}
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                          <span className="text-sm text-foreground">🧾 Emissão de NF</span>
                          <div className="flex min-w-0 flex-wrap gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={emissaoNF === 'sim' ? 'default' : 'outline'}
                              className="h-auto min-h-7 whitespace-normal px-2.5 py-1 text-xs"
                              onClick={() => setEmissaoNF(emissaoNF === 'sim' ? '' : 'sim')}
                            >
                              Sim
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={emissaoNF === 'nao' ? 'default' : 'outline'}
                              className="h-auto min-h-7 whitespace-normal px-2.5 py-1 text-xs"
                              onClick={() => setEmissaoNF(emissaoNF === 'nao' ? '' : 'nao')}
                            >
                              Não
                            </Button>
                          </div>
                        </div>

                        {/* Maquininha */}
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                          <span className="text-sm text-foreground">Maquininha</span>
                          <div className="flex min-w-0 flex-wrap gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={maquininha === 'sim' ? 'default' : 'outline'}
                              className="h-auto min-h-7 whitespace-normal px-2.5 py-1 text-xs"
                              onClick={() => setMaquininha(maquininha === 'sim' ? '' : 'sim')}
                            >
                              Levar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={maquininha === 'nao' ? 'default' : 'outline'}
                              className="h-auto min-h-7 whitespace-normal px-2.5 py-1 text-xs"
                              onClick={() => setMaquininha(maquininha === 'nao' ? '' : 'nao')}
                            >
                              Não Levar
                            </Button>
                          </div>
                        </div>
                      </div>

                      {(pagamento === 'pago' || boleto === 'com' || emissaoNF === 'sim') && (
                        <div
                          className="space-y-1 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground"
                          aria-live="polite"
                        >
                          <p className="font-medium text-foreground">Encaminhamento automático</p>
                          {pagamento === 'pago' && <p>Carol · Baixa de Pedido</p>}
                          {(boleto === 'com' || emissaoNF === 'sim') && (
                            <p>
                              Carol e Patrícia ·{' '}
                              {boleto === 'com' && emissaoNF === 'sim'
                                ? 'NF + Boleto'
                                : boleto === 'com'
                                  ? 'Boleto'
                                  : 'Emissão de NF'}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Forma de Entrega */}
                      <div className="rounded-md border border-border px-3 py-2 space-y-2">
                        <span className="text-sm text-foreground">Forma de Entrega</span>
                        <div className="grid min-w-0 grid-cols-2 gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={formaEntrega === 'motoboy' ? 'default' : 'outline'}
                            className="h-auto min-h-8 min-w-0 whitespace-normal px-2 py-1 text-xs"
                            onClick={() => {
                              setFormaEntrega(formaEntrega === 'motoboy' ? '' : 'motoboy');
                              setModalidadeCorreios('');
                            }}
                          >
                            🏍️ Motoboy
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={formaEntrega === 'correios' ? 'default' : 'outline'}
                            className="h-auto min-h-8 min-w-0 whitespace-normal px-2 py-1 text-xs"
                            onClick={() => {
                              setFormaEntrega(formaEntrega === 'correios' ? '' : 'correios');
                              if (formaEntrega === 'correios') setModalidadeCorreios('');
                            }}
                          >
                            📮 Correios
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={formaEntrega === 'transportadora' ? 'default' : 'outline'}
                            className="h-auto min-h-8 min-w-0 whitespace-normal px-2 py-1 text-xs"
                            onClick={() => {
                              const next =
                                formaEntrega === 'transportadora' ? '' : 'transportadora';
                              setFormaEntrega(next);
                              setModalidadeCorreios('');
                              if (next !== 'transportadora') {
                                setTransportadora('');
                                setTransportadoraOutros('');
                              }
                            }}
                          >
                            🚛 Transportadora
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={formaEntrega === 'balcao' ? 'default' : 'outline'}
                            className="h-auto min-h-8 min-w-0 whitespace-normal px-2 py-1 text-xs"
                            onClick={() => {
                              setFormaEntrega(formaEntrega === 'balcao' ? '' : 'balcao');
                              setModalidadeCorreios('');
                            }}
                          >
                            🏪 Balcão
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={formaEntrega === 'uber' ? 'default' : 'outline'}
                            className="col-span-2 h-auto min-h-8 min-w-0 whitespace-normal px-2 py-1 text-xs"
                            onClick={() => {
                              setFormaEntrega(formaEntrega === 'uber' ? '' : 'uber');
                              setModalidadeCorreios('');
                              setTransportadora('');
                            }}
                          >
                            🚗 Uber (integração futura)
                          </Button>
                        </div>
                        {formaEntrega === 'uber' && (
                          <p className="text-xs text-muted-foreground">
                            Modalidade registrada no pedido. Ainda não gera despacho automatizado.
                          </p>
                        )}
                        {formaEntrega === 'motoboy' && (
                          <p className="text-xs text-muted-foreground">
                            Corrida será criada em Pendentes, pronta para designação.
                          </p>
                        )}
                        {formaEntrega === 'correios' && (
                          <div className="space-y-2 pt-1">
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                              <span className="text-sm text-foreground">Modalidade</span>
                              <div className="flex min-w-0 flex-wrap gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={modalidadeCorreios === 'sedex' ? 'default' : 'outline'}
                                  className="h-auto min-h-7 whitespace-normal px-2.5 py-1 text-xs"
                                  onClick={() =>
                                    setModalidadeCorreios(
                                      modalidadeCorreios === 'sedex' ? '' : 'sedex'
                                    )
                                  }
                                >
                                  SEDEX
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={modalidadeCorreios === 'pac' ? 'default' : 'outline'}
                                  className="h-auto min-h-7 whitespace-normal px-2.5 py-1 text-xs"
                                  onClick={() =>
                                    setModalidadeCorreios(modalidadeCorreios === 'pac' ? '' : 'pac')
                                  }
                                >
                                  PAC
                                </Button>
                              </div>
                            </div>
                            {modalidadeCorreios && (
                              <p className="text-xs text-muted-foreground">
                                📋 Tarefa de etiqueta será criada para William.
                              </p>
                            )}
                          </div>
                        )}
                        {formaEntrega === 'transportadora' && (
                          <div className="space-y-2 pt-1">
                            <div className="rounded-md border border-border px-3 py-2 space-y-2">
                              <span className="text-sm text-foreground">Transportadora</span>
                              <div className="grid min-w-0 grid-cols-2 gap-1.5">
                                {activeCarriers.map((c) => (
                                  <Button
                                    key={c.id}
                                    type="button"
                                    size="sm"
                                    variant={transportadora === c.name ? 'default' : 'outline'}
                                    className="h-auto min-h-8 min-w-0 whitespace-normal px-2 py-1 text-xs"
                                    onClick={() => {
                                      setTransportadora(transportadora === c.name ? '' : c.name);
                                      setTransportadoraOutros('');
                                    }}
                                  >
                                    {c.name}
                                  </Button>
                                ))}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={transportadora === 'outros' ? 'default' : 'outline'}
                                  className="h-auto min-h-8 min-w-0 whitespace-normal px-2 py-1 text-xs"
                                  onClick={() =>
                                    setTransportadora(transportadora === 'outros' ? '' : 'outros')
                                  }
                                >
                                  Outros
                                </Button>
                              </div>
                              {activeCarriers.length === 0 && (
                                <p className="text-[11px] text-muted-foreground">
                                  Nenhuma transportadora cadastrada. Use "Outros" ou peça a um
                                  administrador para cadastrar em Corporativo › Transportadoras.
                                </p>
                              )}
                              {transportadora === 'outros' && (
                                <Input
                                  placeholder="Nome da transportadora"
                                  value={transportadoraOutros}
                                  onChange={(e) => setTransportadoraOutros(e.target.value)}
                                  className="h-auto min-h-8 min-w-0 whitespace-normal px-2 py-1 text-xs"
                                />
                              )}
                            </div>
                            {transportadora &&
                              (transportadora !== 'outros' || transportadoraOutros.trim()) && (
                                <p className="text-xs text-muted-foreground">
                                  📋 Tarefa pessoal será criada para Patrícia.
                                </p>
                              )}
                          </div>
                        )}
                      </div>

                      {/* OCR Image field for Sedex/PAC ou Transportadora selecionada */}
                      {(modalidadeCorreios === 'sedex' ||
                        modalidadeCorreios === 'pac' ||
                        (formaEntrega === 'transportadora' &&
                          transportadora &&
                          (transportadora !== 'outros' || transportadoraOutros.trim()))) && (
                        <div className="rounded-md border border-border px-3 py-2 space-y-2">
                          <div className="flex items-center gap-2">
                            <ScanText className="w-4 h-4 text-primary" />
                            <span className="text-sm text-foreground">
                              Colar imagem para transcrição IA
                            </span>
                          </div>
                          <div
                            className="min-h-[60px] rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                            onPaste={handleOcrPaste}
                            tabIndex={0}
                          >
                            {ocrLoading ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Transcrevendo...
                              </div>
                            ) : ocrImage ? (
                              <div className="relative p-2">
                                <img
                                  src={ocrImage}
                                  alt="OCR"
                                  className="max-h-24 rounded border border-border"
                                />
                                <button
                                  onClick={() => setOcrImage(null)}
                                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground py-3">
                                Cole uma imagem aqui (Ctrl+V) para transcrever automaticamente
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-border/70 pt-4 lg:col-span-2">
            <Button
              className="h-11 w-full text-sm font-semibold"
              onClick={handleSubmit}
              disabled={
                !isValid || uploading || (isOrderDialog && (!isTargetingExpedicao || !isSeparacao))
              }
            >
              {uploading ? 'Enviando...' : isOrderDialog ? 'Criar Pedido' : 'Criar Tarefa'}
            </Button>
          </div>
        </div>
      </DialogContent>
      {isOrderDialog && (
        <>
          <Dialog open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
            <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Selecionar cliente</DialogTitle>
                <DialogDescription>Cadastro de Departamental → Clientes.</DialogDescription>
              </DialogHeader>
              <Input
                aria-label="Buscar cliente cadastrado"
                placeholder="Buscar nome, telefone ou endereço"
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
              />
              {clientReadError && (
                <p className="text-sm text-destructive">Sem acesso à base de clientes.</p>
              )}
              <div className="max-h-[45vh] space-y-1 overflow-y-auto">
                {clients
                  .filter((c) =>
                    [c.companyName, c.contactPerson, c.phone, c.address].some((v) =>
                      (v || '')
                        .toLocaleLowerCase('pt-BR')
                        .includes(clientQuery.toLocaleLowerCase('pt-BR'))
                    )
                  )
                  .slice(0, 50)
                  .map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      className="w-full rounded-lg border border-border p-3 text-left hover:bg-accent"
                      onClick={() => chooseClient(client)}
                    >
                      <span className="block text-sm font-medium">{client.companyName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {client.address}
                      </span>
                    </button>
                  ))}
              </div>
            </DialogContent>
          </Dialog>
          <ClientEditorDialog
            open={clientCreatorOpen}
            onOpenChange={setClientCreatorOpen}
            onSave={registerClient}
          />
        </>
      )}
    </Dialog>
  );
};

export default CreateTaskDialog;
