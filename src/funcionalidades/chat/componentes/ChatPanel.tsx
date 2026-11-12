import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { User, ChatMessage } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Send, Paperclip, Mic, Image, FileText, MicOff, CheckCheck, Smile, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatRichText } from './ChatRichText';
import { saveChatAttachment } from './saveChatAttachment';
import { toast } from 'sonner';
import { useChat } from '@/funcionalidades/chat/hooks/useChat';
import {
  usePrivateTyping,
  usePrivateTypingUsers,
} from '@/funcionalidades/chat/hooks/useTypingPresence';
import { uploadImage } from '@/lib/uploadImage';
import { getSignedUrl } from '@/lib/signedUrl';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  ChatAvatar,
  SafeChatImage,
  TypingBubble,
} from '@/funcionalidades/chat/componentes/ChatMedia';

interface ChatPanelProps {
  otherUser: User;
}

const SecureAttachment = ({ src, name }: { src: string; name: string }) => {
  const [href, setHref] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setHref(null);
    setFailed(false);
    void getSignedUrl(src)
      .then((url) => {
        if (!active) return;
        if (url) setHref(url);
        else setFailed(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [src, retry]);
  return href ? (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 break-all text-xs underline"
      >
        <FileText className="h-4 w-4 shrink-0" />
        Abrir {name}
      </a>
      <button
        type="button"
        className="ml-2 text-xs underline"
        aria-label={`Salvar ${name}`}
        onClick={() => void saveChatAttachment(href, name)}
      >
        Salvar
      </button>
    </>
  ) : failed ? (
    <span role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      Arquivo indisponível.
      <button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>
        Tentar novamente
      </button>
    </span>
  ) : (
    <span role="status" className="text-xs">
      Carregando arquivo protegido...
    </span>
  );
};

const ChatPanel = ({ otherUser }: ChatPanelProps) => {
  const { authenticatedUser: currentUser, users } = useApp();
  const { messages, sendMessage, getMessagesForChat, reactToMessage } = useChat();
  const historySessionRef = useRef<ReturnType<typeof getMessagesForChat> | null>(null);
  const historyLoadingRef = useRef(false);
  const restoreScrollRef = useRef<{ height: number; top: number } | null>(null);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [detailsMessage, setDetailsMessage] = useState<ChatMessage | null>(null);
  const [reactionsFor, setReactionsFor] = useState<string | null>(null);
  const pointerSwipeStart = useRef<{
    id: string;
    pointerId: number;
    x: number;
    y: number;
    dragging: boolean;
  } | null>(null);
  const [draggedMessage, setDraggedMessage] = useState<{ id: string; dx: number } | null>(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const emojis = [
    '😀',
    '😂',
    '🥰',
    '😍',
    '😎',
    '😭',
    '😢',
    '👍',
    '👏',
    '🙏',
    '❤️',
    '💙',
    '🔥',
    '🎉',
    '✅',
    '👀',
    '🤝',
    '💯',
    '😅',
    '😮',
    '😊',
    '💪',
    '🙌',
    '🤔',
  ];
  const [recording, setRecording] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerLastSeen, setPartnerLastSeen] = useState<number | null>(null);
  useEffect(() => {
    const stop = onSnapshot(
      doc(db, 'presence', otherUser.id),
      (snap) => {
        const data = snap.data();
        const last = data?.last_seen_at;
        const ms =
          typeof last?.toMillis === 'function' ? last.toMillis() : Date.parse(String(last ?? ''));
        setPartnerLastSeen(Number.isFinite(ms) && ms > 0 ? ms : null);
        setPartnerOnline(
          data?.status === 'online' && Number.isFinite(ms) && Date.now() - ms < 90_000
        );
      },
      () => setPartnerOnline(false)
    );
    return stop;
  }, [otherUser.id]);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const previousChatIdRef = useRef<string | null>(null);
  const userInteractedWithScrollRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const isStartingRecordingRef = useRef(false);
  const recordingStartedAtRef = useRef<number | null>(null);
  const stopRequestedByUserRef = useRef(false);

  const { isOtherTyping, pingTyping, stopTyping } = usePrivateTyping(currentUser?.id, otherUser.id);
  const privateTypingUserIds = usePrivateTypingUsers(currentUser?.id);
  const isTyping = isOtherTyping || privateTypingUserIds.includes(otherUser.id);

  useEffect(() => {
    if (!currentUser?.id || !otherUser.id) return;
    const session = getMessagesForChat(currentUser.id, otherUser.id);
    historySessionRef.current = session;
    return () => {
      session.stop();
      historySessionRef.current = null;
    };
  }, [currentUser?.id, otherUser.id, getMessagesForChat]);

  const chatId = [currentUser?.id, otherUser.id].sort().join(':');

  // A rolagem programática não deve ser interpretada como uma ação do usuário.
  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (!container || !shouldAutoScrollRef.current) return;

    container.scrollTop = container.scrollHeight;
  };

  // Posiciona a conversa no final assim que as mensagens são renderizadas.
  useLayoutEffect(() => {
    if (previousChatIdRef.current !== chatId) {
      previousChatIdRef.current = chatId;
      shouldAutoScrollRef.current = true;
      userInteractedWithScrollRef.current = false;
    }

    if (restoreScrollRef.current && messages.length) {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop =
          restoreScrollRef.current.top + container.scrollHeight - restoreScrollRef.current.height;
        restoreScrollRef.current = null;
        return;
      }
    }
    scrollToBottom();

    // Reconfere a posição após o navegador recalcular o layout.
    const frame = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(frame);
  }, [chatId, messages, isTyping]);

  // Observa a altura de TODA a conversa, inclusive alterações após o carregamento
  // de imagens e fontes. Observar apenas o contêiner com scroll não é suficiente.
  useEffect(() => {
    const container = messagesContainerRef.current;
    const content = container?.firstElementChild;
    if (!container || !content || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      scrollToBottom();
    });

    observer.observe(content);
    observer.observe(container);
    return () => observer.disconnect();
  }, [chatId]);

  const handleUserScroll = () => {
    userInteractedWithScrollRef.current = true;
  };

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;

      if (recorder && recorder.state !== 'inactive') {
        // Não envia uma gravação ao sair da conversa.
        recorder.onstop = null;
        recorder.stop();
      }

      mediaRecorderRef.current = null;
      recordingStartedAtRef.current = null;
      stopRequestedByUserRef.current = false;

      microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());

      microphoneStreamRef.current = null;
    };
  }, []);

  if (!currentUser) return null;

  const handleSend = () => {
    if (!text.trim()) return;

    void sendMessage({
      receiverId: otherUser.id,
      content: text.trim(),
      ...(replyTo
        ? {
            replyToId: replyTo.id,
            replyToContent: replyTo.content.slice(0, 180),
            replyToSenderId: replyTo.senderId,
          }
        : {}),
    });

    setReplyTo(null);
    setText('');
    stopTyping();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const sendImage = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Imagem muito grande (máx. 15 MB)');
      return;
    }

    setUploadingImage(true);

    try {
      const participants = [currentUser.id, otherUser.id].sort();

      const { publicUrl } = await uploadImage(file, {
        pathPrefix: `chat/private/${participants[0]}/${participants[1]}`,
        sourceTable: 'messages',
        sourceField: 'attachmentUrl',
        uploadedBy: currentUser.id,
        privateAccess: true,
      });

      await sendMessage({
        receiverId: otherUser.id,
        content: '📷 Imagem',
        attachmentUrl: publicUrl,
        attachmentType: 'image',
        attachmentName: file.name || 'imagem',
      });
    } catch (error) {
      console.error('Erro ao enviar imagem no chat:', error);
      toast.error('Não foi possível enviar a imagem');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'image' | 'file'
  ) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    if (files.length > 10) {
      toast.error('Selecione no máximo 10 arquivos por vez.');
      return;
    }
    if (uploadingImage) {
      toast.info('Aguarde o envio anterior terminar.');
      return;
    }
    setUploadingImage(true);
    let failed = 0;
    try {
      for (const [index, file] of files.entries()) {
        setUploadProgress(`Enviando ${index + 1} de ${files.length}: ${file.name}`);
        try {
          if (type === 'image' || file.type.startsWith('image/')) {
            if (file.size > 15 * 1024 * 1024) throw new Error('Imagem acima de 15 MB');
            const participants = [currentUser.id, otherUser.id].sort();
            const { publicUrl } = await uploadImage(file, {
              pathPrefix: `chat/private/${participants[0]}/${participants[1]}`,
              sourceTable: 'messages',
              sourceField: 'attachmentUrl',
              uploadedBy: currentUser.id,
              privateAccess: true,
            });
            await sendMessage({
              receiverId: otherUser.id,
              content: '📷 Imagem',
              attachmentUrl: publicUrl,
              attachmentType: 'image',
              attachmentName: file.name || 'imagem',
            });
          } else {
            if (file.size > 15 * 1024 * 1024) throw new Error('Arquivo acima de 15 MB');
            const participants = [currentUser.id, otherUser.id].sort();
            const { publicUrl } = await uploadImage(file, {
              pathPrefix: `chat/private/${participants[0]}/${participants[1]}`,
              sourceTable: 'messages',
              sourceField: 'attachmentUrl',
              uploadedBy: currentUser.id,
              privateAccess: true,
            });
            await sendMessage({
              receiverId: otherUser.id,
              content: `📎 ${file.name}`,
              attachmentUrl: publicUrl,
              attachmentType: 'file',
              attachmentName: file.name,
            });
          }
        } catch (error) {
          failed++;
          console.error('Falha no anexo:', file.name, error);
          toast.error(`Não foi possível enviar ${file.name}`);
        }
      }
      if (failed === 0) toast.success(`${files.length} arquivo(s) enviado(s)`);
    } finally {
      setUploadProgress(null);
      setUploadingImage(false);
    }
  };

  const stopMicrophoneStream = () => {
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStreamRef.current = null;
  };

  const microphoneErrorMessage = (error: unknown) => {
    const name = error instanceof DOMException ? error.name : '';

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'O microfone está bloqueado. Clique no cadeado ao lado do endereço e permita o acesso ao microfone.';
    }

    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'Nenhum microfone foi encontrado neste computador.';
    }

    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'O microfone está sendo usado por outro aplicativo ou não pôde ser iniciado.';
    }

    if (name === 'SecurityError') {
      return 'O navegador bloqueou o microfone por segurança. Use HTTPS ou localhost.';
    }

    return 'Não foi possível acessar o microfone. Verifique a permissão do navegador e do Windows.';
  };

  const toggleRecording = async () => {
    // Usa a referência síncrona para evitar uma segunda gravação enquanto
    // o React ainda não terminou de atualizar o estado visual do botão.
    const activeRecorder = mediaRecorderRef.current;
    if (activeRecorder) {
      if (activeRecorder.state === 'recording') {
        stopRequestedByUserRef.current = true;
        activeRecorder.stop();
      }
      return;
    }

    if (isStartingRecordingRef.current) return;

    if (!window.isSecureContext) {
      toast.error('O microfone só funciona em HTTPS ou localhost.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Este navegador não oferece acesso ao microfone.');
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      toast.error('A gravação de áudio não é suportada neste navegador.');
      return;
    }

    isStartingRecordingRef.current = true;

    try {
      if (navigator.permissions?.query) {
        try {
          const permission = await navigator.permissions.query({
            name: 'microphone' as PermissionName,
          });

          if (permission.state === 'denied') {
            toast.error('Permita o uso do microfone nas configurações deste site.');
            return;
          }
        } catch {
          // A Permissions API não oferece suporte uniforme ao microfone.
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      microphoneStreamRef.current = stream;
      const activeAudioTrack = stream.getAudioTracks().find((track) => track.readyState === 'live');
      if (!activeAudioTrack || !activeAudioTrack.enabled) {
        throw new Error('Nenhuma faixa de áudio ativa foi disponibilizada pelo microfone.');
      }

      const preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
      const mimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      let recorderFailed = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onerror = (event) => {
        console.error('Erro durante a gravação de áudio:', event);
        recorderFailed = true;
        toast.error('A gravação de áudio foi interrompida. Tente novamente.');
        if (recorder.state !== 'inactive') recorder.stop();
      };

      recorder.onstop = () => {
        const elapsedMs =
          recordingStartedAtRef.current === null ? 0 : Date.now() - recordingStartedAtRef.current;
        const wasManuallyStopped = stopRequestedByUserRef.current;
        const finalMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: finalMimeType });

        if (mediaRecorderRef.current === recorder) mediaRecorderRef.current = null;
        recordingStartedAtRef.current = null;
        stopRequestedByUserRef.current = false;
        setRecording(false);
        stopMicrophoneStream();

        // Não envia arquivos quando o dispositivo desconecta, quando ocorre
        // erro ou quando o usuário fecha a conversa sem concluir a gravação.
        if (recorderFailed || !wasManuallyStopped) {
          if (!recorderFailed)
            toast.error('O microfone foi interrompido antes do fim da gravação.');
          return;
        }

        if (elapsedMs < 1000 || blob.size < 1000) {
          toast.error('Áudio muito curto ou vazio. Grave por pelo menos 1 segundo.');
          return;
        }

        if (blob.size > 700 * 1024) {
          toast.error('Áudio muito longo para o chat. Grave um áudio menor.');
          return;
        }

        const extension = finalMimeType.includes('ogg') ? 'ogg' : 'webm';
        const reader = new FileReader();
        reader.onerror = () => toast.error('Não foi possível preparar o arquivo de áudio.');
        reader.onload = () => {
          if (typeof reader.result !== 'string') return;
          void sendMessage({
            receiverId: otherUser.id,
            content: '🎤 Áudio',
            attachmentUrl: reader.result,
            attachmentType: 'audio',
            attachmentName: `audio.${extension}`,
          });
        };
        reader.readAsDataURL(blob);
      };

      // Divide em partes para que o navegador entregue dados durante a gravação.
      recorder.start(250);
      recordingStartedAtRef.current = Date.now();
      stopRequestedByUserRef.current = false;
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (error) {
      console.error('Erro ao acessar ou iniciar microfone:', error);
      mediaRecorderRef.current = null;
      recordingStartedAtRef.current = null;
      stopRequestedByUserRef.current = false;
      stopMicrophoneStream();
      setRecording(false);
      toast.error(microphoneErrorMessage(error));
    } finally {
      isStartingRecordingRef.current = false;
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) continue;

      e.preventDefault();
      const file = item.getAsFile();
      if (file) void sendImage(file);
      return;
    }
  };

  const handleMessageSwipe = (msg: ChatMessage, dx: number, dy: number) => {
    if (msg.deleted || Math.abs(dx) < 65 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    setReactionsFor(null);
    if (dx > 0) {
      setDetailsMessage(null);
      setReplyTo(msg);
    } else {
      setDetailsMessage(msg);
    }
  };

  const renderMessage = (msg: ChatMessage) => {
    const isMe = msg.senderId === currentUser.id;
    const senderUser = users.find((u) => u.id === msg.senderId);
    const read = isMe && msg.read;

    return (
      <div
        key={msg.id}
        className={cn('group flex items-center gap-1', isMe ? 'justify-end' : 'justify-start')}
      >
        <div
          className={cn(
            'relative z-10 flex shrink-0 flex-col items-center gap-1 self-center',
            isMe ? 'order-1' : 'order-2'
          )}
        >
          <button
            type="button"
            className="rounded-full p-1 opacity-65 transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            title="Reagir à mensagem"
            aria-label="Reagir à mensagem"
            aria-expanded={reactionsFor === msg.id}
            disabled={Boolean(msg.deleted)}
            onClick={() => setReactionsFor((previous) => (previous === msg.id ? null : msg.id))}
          >
            <Smile className="h-4 w-4" />
          </button>
          {reactionsFor === msg.id && !msg.deleted && (
            <div
              role="group"
              aria-label="Escolher reação"
              className={cn(
                'absolute bottom-full z-50 mb-2 flex items-center gap-0.5 rounded-2xl border border-border bg-popover/95 px-2 py-1.5 shadow-xl backdrop-blur-sm',
                'animate-in fade-in slide-in-from-bottom-2 zoom-in-95 duration-200 motion-reduce:animate-none',
                isMe ? 'right-0 origin-bottom-right' : 'left-0 origin-bottom-left'
              )}
            >
              {['👍', '❤️', '😂', '😮', '🙏', '🔥'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl transition-all duration-150 ease-out hover:z-10 hover:-translate-y-1 hover:scale-125 hover:bg-accent hover:drop-shadow-md active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transform-none"
                  title={`Reagir com ${emoji}`}
                  aria-label={`Reagir com ${emoji}`}
                  aria-pressed={msg.reactions?.[currentUser.id] === emoji}
                  onClick={() => {
                    void reactToMessage(
                      msg.id,
                      msg.reactions?.[currentUser.id] === emoji ? null : emoji
                    );
                    setReactionsFor(null);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <div
          onDoubleClick={() => {
            if (!msg.deleted)
              void reactToMessage(msg.id, msg.reactions?.[currentUser.id] === '❤️' ? null : '❤️');
          }}
          onDragStart={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            if (msg.deleted || event.pointerType === 'mouse') return;
            const target = event.target as HTMLElement;
            if (target.closest('button, a, img, input, textarea, video, audio')) return;
            pointerSwipeStart.current = {
              id: msg.id,
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              dragging: false,
            };
            // A captura garante que o gesto continue mesmo quando o cursor sai da bolha.
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = pointerSwipeStart.current;
            if (!start || start.id !== msg.id || start.pointerId !== event.pointerId) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (!start.dragging && Math.abs(dx) > 9 && Math.abs(dx) > Math.abs(dy) * 1.2)
              start.dragging = true;
            if (start.dragging) {
              if (event.cancelable) event.preventDefault();
              setDraggedMessage({ id: msg.id, dx: Math.max(-105, Math.min(105, dx)) });
            }
          }}
          onPointerUp={(event) => {
            const start = pointerSwipeStart.current;
            if (!start || start.id !== msg.id || start.pointerId !== event.pointerId) return;
            pointerSwipeStart.current = null;
            setDraggedMessage(null);
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            if (start.dragging)
              handleMessageSwipe(msg, event.clientX - start.x, event.clientY - start.y);
          }}
          onPointerCancel={(event) => {
            if (pointerSwipeStart.current?.pointerId === event.pointerId) {
              pointerSwipeStart.current = null;
              setDraggedMessage(null);
            }
          }}
          style={{
            touchAction: 'pan-y',
            transform:
              draggedMessage?.id === msg.id ? `translateX(${draggedMessage.dx}px)` : undefined,
            transition: draggedMessage?.id === msg.id ? 'none' : 'transform 180ms ease-out',
            cursor: msg.deleted ? 'default' : 'grab',
          }}
          className={cn(
            'order-1 relative max-w-[82%] select-text break-words rounded-2xl px-3.5 py-2.5 text-sm sm:max-w-[70%]',
            isMe
              ? 'rounded-br-md bg-primary text-primary-foreground'
              : 'rounded-bl-md bg-secondary text-secondary-foreground',
            msg.deleted && 'opacity-60'
          )}
        >
          {!isMe && (
            <p className="mb-0.5 text-[10px] font-semibold opacity-70">
              {senderUser?.name || 'Usuário'}
            </p>
          )}

          <>
            {msg.replyToId && !msg.deleted && (
              <div className="mb-2 rounded-md border-l-2 border-current bg-background/15 px-2 py-1 text-xs opacity-80">
                <span className="font-semibold">
                  Respondendo a{' '}
                  {msg.replyToSenderId === currentUser.id
                    ? 'você'
                    : users.find((u) => u.id === msg.replyToSenderId)?.name || 'mensagem'}
                </span>
                <p className="truncate">{msg.replyToContent || 'Mensagem'}</p>
              </div>
            )}
            {msg.attachmentUrl && !msg.deleted && (
              <div className="mb-2">
                {msg.attachmentType === 'image' && (
                  <SafeChatImage
                    src={msg.attachmentUrl}
                    alt="Imagem enviada no chat"
                    className="max-h-56 max-w-full cursor-pointer rounded-xl object-cover transition-opacity hover:opacity-90"
                    onClick={() => setEnlargedImage(msg.attachmentUrl || null)}
                  />
                )}

                {msg.attachmentType === 'audio' && (
                  <audio controls src={msg.attachmentUrl} className="max-w-full" />
                )}

                {msg.attachmentType === 'file' && (
                  <SecureAttachment
                    src={msg.attachmentUrl}
                    name={msg.attachmentName || 'Arquivo'}
                  />
                )}
              </div>
            )}

            <p className={cn('whitespace-pre-wrap break-words', msg.deleted && 'italic')}>
              <ChatRichText text={msg.content || ''} />
            </p>

            {!msg.deleted && Object.values(msg.reactions || {}).length > 0 && (
              <div className="mt-1 flex gap-1 text-[11px]" aria-label="Reações da mensagem">
                {[...new Set(Object.values(msg.reactions || {}))].map((emoji) => (
                  <span key={emoji} className="rounded-full bg-background/15 px-1.5 py-0.5">
                    {emoji}{' '}
                    {Object.values(msg.reactions || {}).filter((item) => item === emoji).length}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-1 flex items-center gap-1">
              <span className={cn('text-[10px]', isMe ? 'opacity-60' : 'text-muted-foreground')}>
                {new Date(msg.timestamp).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                })}{' '}
                {new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>

              {msg.edited && !msg.deleted && (
                <span className="text-[9px] opacity-50">(editada)</span>
              )}

              {isMe && !msg.deleted && (
                <span
                  title={
                    msg.readAt
                      ? `Lida em ${new Date(msg.readAt).toLocaleString('pt-BR')}`
                      : read
                        ? 'Lida'
                        : 'Enviada'
                  }
                >
                  <CheckCheck
                    className={cn('ml-0.5 h-3.5 w-3.5', read ? 'text-blue-400' : 'opacity-40')}
                  />
                </span>
              )}
            </div>
          </>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 max-h-full flex-col overflow-hidden">
      <Sheet
        open={Boolean(detailsMessage)}
        onOpenChange={(open) => {
          if (!open) setDetailsMessage(null);
        }}
      >
        <SheetContent side="right" className="w-[min(440px,100vw)] overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Dados da mensagem</SheetTitle>
            <SheetDescription>Informações de envio e leitura.</SheetDescription>
          </SheetHeader>
          {detailsMessage && (
            <div className="mt-8 space-y-6 text-sm">
              <div
                className={cn(
                  'max-w-full rounded-xl border p-3',
                  detailsMessage.senderId === currentUser.id ? 'bg-primary/10' : 'bg-muted/60'
                )}
              >
                <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
                  {detailsMessage.content || (detailsMessage.attachmentUrl ? 'Anexo' : 'Mensagem')}
                </p>
                <p className="mt-2 text-right text-xs text-muted-foreground">
                  {new Date(detailsMessage.timestamp).toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="space-y-1 border-b pb-4">
                <p className="font-medium">Remetente</p>
                <p className="text-muted-foreground">
                  {users.find((u) => u.id === detailsMessage.senderId)?.name ||
                    detailsMessage.senderId}
                </p>
              </div>
              <div className="space-y-1 border-b pb-4">
                <p className="font-medium">Enviada</p>
                <p className="text-muted-foreground">
                  {new Date(detailsMessage.timestamp).toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="space-y-1 border-b pb-4">
                <p className="font-medium">Lida</p>
                <p className="text-muted-foreground">
                  {detailsMessage.readAt
                    ? new Date(detailsMessage.readAt).toLocaleString('pt-BR')
                    : detailsMessage.read
                      ? 'Visualizada (horário não registrado)'
                      : 'Ainda não visualizada'}
                </p>
              </div>
              {detailsMessage.edited && (
                <p className="text-xs text-muted-foreground">Mensagem editada</p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      <div className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-card p-4">
        <ChatAvatar src={otherUser.avatar} name={otherUser.name} className="h-10 w-10 rounded-xl" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{otherUser.name}</p>
          {isTyping ? (
            <p className="truncate text-[11px] font-bold italic text-primary animate-pulse [animation-duration:1.8s]">
              Digitando...
            </p>
          ) : (
            <p className="truncate text-[11px] text-muted-foreground">
              {partnerOnline
                ? 'Online'
                : partnerLastSeen
                  ? `Última atividade: ${new Date(partnerLastSeen).toLocaleString('pt-BR')}`
                  : 'Offline'}{' '}
              · @{otherUser.username}
            </p>
          )}
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        onWheel={handleUserScroll}
        onTouchStart={handleUserScroll}
        onPointerDown={handleUserScroll}
        onKeyDown={handleUserScroll}
        onScroll={(event) => {
          // Eventos de scroll disparados pelo código ou por mudanças de layout
          // não podem desativar a rolagem automática.
          if (!userInteractedWithScrollRef.current) return;

          const container = event.currentTarget;
          const distanceFromBottom =
            container.scrollHeight - container.scrollTop - container.clientHeight;
          shouldAutoScrollRef.current = distanceFromBottom < 100;
          if (
            container.scrollTop < 100 &&
            !historyLoadingRef.current &&
            historySessionRef.current
          ) {
            historyLoadingRef.current = true;
            restoreScrollRef.current = { height: container.scrollHeight, top: container.scrollTop };
            void historySessionRef.current
              .loadOlder()
              .then((loaded) => {
                if (!loaded) restoreScrollRef.current = null;
              })
              .finally(() => {
                historyLoadingRef.current = false;
              });
          }
        }}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 [overflow-anchor:none]"
      >
        <div className="space-y-3">
          {messages.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma mensagem ainda. Comece a conversa!
            </p>
          )}

          {messages.map(renderMessage)}
          {isTyping && <TypingBubble label={otherUser.name} />}
        </div>
      </div>

      {replyTo && (
        <div className="flex items-center justify-between border-t bg-muted/50 px-4 py-2 text-xs">
          <div className="min-w-0">
            <strong>
              Respondendo a {replyTo.senderId === currentUser.id ? 'você' : otherUser.name}
            </strong>
            <p className="truncate">{replyTo.content}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setReplyTo(null)}
            aria-label="Cancelar resposta"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="flex shrink-0 items-end gap-2 border-t border-border/70 bg-card p-3 md:p-4">
        <input
          ref={imageInputRef}
          multiple
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e, 'image')}
        />
        <input
          ref={fileInputRef}
          multiple
          type="file"
          className="hidden"
          onChange={(e) => handleFileSelect(e, 'file')}
        />

        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          disabled={uploadingImage}
          onClick={() => imageInputRef.current?.click()}
        >
          <Image className="h-4 w-4" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          disabled={uploadingImage}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <Button
          size="icon"
          variant={recording ? 'destructive' : 'ghost'}
          className="h-9 w-9 shrink-0"
          onClick={toggleRecording}
        >
          {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>

        <div className="relative shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            title="Emojis"
            onClick={() => setShowEmojis((v) => !v)}
          >
            <Smile className="h-4 w-4" />
          </Button>
          {showEmojis && (
            <div className="absolute bottom-full left-0 z-50 mb-2 grid w-56 grid-cols-6 gap-1 rounded-lg border bg-popover p-2 shadow-lg">
              {emojis.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  className="rounded p-1 text-xl hover:bg-accent"
                  onClick={() => {
                    setText((v) => v + emoji);
                    setShowEmojis(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <Textarea
          placeholder={uploadProgress || 'Digite uma mensagem...'}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim()) pingTyping();
            else stopTyping();
          }}
          onBlur={stopTyping}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="max-h-32 min-h-[40px] min-w-0 resize-none py-2 text-sm"
          rows={1}
        />

        <Button onClick={handleSend} disabled={!text.trim()} size="icon" className="shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={!!enlargedImage} onOpenChange={() => setEnlargedImage(null)}>
        <DialogContent className="max-h-[90vh] max-w-[90vw] p-2">
          <DialogTitle className="sr-only">Imagem ampliada do chat</DialogTitle>
          <DialogDescription className="sr-only">
            Visualização ampliada da imagem enviada na conversa.
          </DialogDescription>

          {enlargedImage && (
            <SafeChatImage
              src={enlargedImage}
              alt="Imagem ampliada"
              className="h-full max-h-[85vh] w-full rounded-xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatPanel;
