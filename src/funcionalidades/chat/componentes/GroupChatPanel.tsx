import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Paperclip, Image, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatRichText } from './ChatRichText';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { saveChatAttachment } from './saveChatAttachment';
import { toast } from 'sonner';
import { useGroupChat, GroupMessage } from '@/funcionalidades/chat/hooks/useGroupChat';
import { useGroupTyping } from '@/funcionalidades/chat/hooks/useTypingPresence';
import { uploadImage } from '@/lib/uploadImage';
import { getSignedUrl } from '@/lib/signedUrl';
import { SafeChatImage, TypingBubble } from '@/funcionalidades/chat/componentes/ChatMedia';

interface GroupChatPanelProps {
  groupId: string;
  groupName: string;
}

const GroupAttachment = ({ src, name }: { src: string; name: string }) => {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getSignedUrl(src)
      .then((url) => {
        if (active) setHref(url);
      })
      .catch(() => {
        if (active) setHref(null);
      });
    return () => {
      active = false;
    };
  }, [src]);
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
  ) : (
    <span className="text-xs">Carregando arquivo protegido...</span>
  );
};

const GroupChatPanel = ({ groupId, groupName }: GroupChatPanelProps) => {
  const { authenticatedUser: currentUser, users } = useApp();
  const { messages, sendMessage, loadOlder, hasMore } = useGroupChat(groupId);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollRestoreRef = useRef<{ height: number; top: number } | null>(null);
  const loadingOlderRef = useRef(false);
  const nearBottomRef = useRef(true);

  const [text, setText] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { typingUserIds, pingTyping, stopTyping } = useGroupTyping(currentUser?.id, groupId);

  const typingNames = typingUserIds
    .map((id) => users.find((user) => user.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  useLayoutEffect(() => {
    const area = scrollAreaRef.current;
    if (!area) return;
    if (scrollRestoreRef.current) {
      const prior = scrollRestoreRef.current;
      area.scrollTop = prior.top + area.scrollHeight - prior.height;
      scrollRestoreRef.current = null;
    } else if (nearBottomRef.current) {
      area.scrollTop = area.scrollHeight;
    }
  }, [messages.length, typingUserIds.length]);
  useEffect(() => {
    nearBottomRef.current = true;
  }, [groupId]);

  if (!currentUser) return null;

  const handleSend = () => {
    if (!text.trim()) return;

    void sendMessage(currentUser.username, { content: text.trim() });
    setText('');
    stopTyping();
  };

  const sendImage = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Imagem muito grande (máx. 15 MB)');
      return;
    }

    setUploadingImage(true);

    try {
      const { publicUrl } = await uploadImage(file, {
        pathPrefix: `chat/groups/${groupId}`,
        sourceTable: 'group_messages',
        sourceField: 'attachment_url',
        uploadedBy: currentUser.id,
        privateAccess: true,
      });

      await sendMessage(currentUser.username, {
        content: '📷 Imagem',
        attachmentUrl: publicUrl,
        attachmentType: 'image',
        attachmentName: file.name || 'imagem',
      });
    } catch (error) {
      console.error('Erro ao enviar imagem no grupo:', error);
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
    if (!files.length) return;
    if (files.length > 10) {
      toast.error('Selecione no máximo 10 arquivos.');
      return;
    }
    if (uploadingImage) {
      toast.info('Aguarde o envio anterior.');
      return;
    }
    setUploadingImage(true);
    let failed = 0;
    try {
      for (const file of files) {
        try {
          if (file.size > 15 * 1024 * 1024) throw new Error('Arquivo acima de 15 MB');
          const isImage = type === 'image' || file.type.startsWith('image/');
          const { publicUrl } = await uploadImage(file, {
            pathPrefix: `chat/groups/${groupId}`,
            sourceTable: 'group_messages',
            sourceField: 'attachment_url',
            uploadedBy: currentUser.id,
            privateAccess: true,
          });
          await sendMessage(currentUser.username, {
            content: isImage ? '📷 Imagem' : `📎 ${file.name}`,
            attachmentUrl: publicUrl,
            attachmentType: isImage ? 'image' : 'file',
            attachmentName: file.name,
          });
        } catch (error) {
          failed++;
          console.error('Falha ao enviar arquivo de grupo:', error);
          toast.error(`Não foi possível enviar ${file.name}`);
        }
      }
      if (!failed) toast.success(`${files.length} arquivo(s) enviado(s)`);
    } finally {
      setUploadingImage(false);
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

  const renderMessage = (msg: GroupMessage) => {
    const isMe = msg.sender_username === currentUser.username;
    const senderUser = users.find((u) => u.username === msg.sender_username);

    return (
      <div key={msg.id} className={cn('group flex', isMe ? 'justify-end' : 'justify-start')}>
        <div
          className={cn(
            'relative max-w-[82%] break-words rounded-2xl px-3.5 py-2.5 text-sm sm:max-w-[70%]',
            isMe
              ? 'rounded-br-md bg-primary text-primary-foreground'
              : 'rounded-bl-md bg-secondary text-secondary-foreground',
            msg.deleted && 'opacity-60'
          )}
        >
          {!isMe && (
            <p className="mb-0.5 text-[10px] font-semibold opacity-70">
              {senderUser?.name || msg.sender_username}
            </p>
          )}

          <>
            {msg.attachment_url && !msg.deleted && (
              <div className="mb-2">
                {msg.attachment_type === 'image' && (
                  <SafeChatImage
                    src={msg.attachment_url}
                    alt="Imagem enviada no grupo"
                    onClick={() => setEnlargedImage(msg.attachment_url)}
                    className="max-h-56 max-w-full cursor-zoom-in rounded-xl object-cover"
                  />
                )}

                {msg.attachment_type === 'file' && (
                  <GroupAttachment
                    src={msg.attachment_url}
                    name={msg.attachment_name || 'Arquivo'}
                  />
                )}
              </div>
            )}

            <p className={cn('whitespace-pre-wrap break-words', msg.deleted && 'italic')}>
              <ChatRichText text={msg.content || ''} />
            </p>

            <div className="mt-1 flex items-center gap-1">
              <span className={cn('text-[10px]', isMe ? 'opacity-60' : 'text-muted-foreground')}>
                {msg.created_at
                  ? new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'agora'}
              </span>

              {msg.edited && !msg.deleted && (
                <span className="text-[9px] opacity-50">(editada)</span>
              )}
            </div>
          </>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 max-h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-card p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
          {groupName[0]?.toUpperCase() || 'G'}
        </div>
        <div>
          <p className="text-sm font-semibold">{groupName}</p>
          <p className="text-[11px] text-muted-foreground">
            {typingNames.length > 0
              ? `${typingNames.slice(0, 2).join(', ')} digitando…`
              : 'Chat de grupo'}
          </p>
        </div>
      </div>

      <div
        ref={scrollAreaRef}
        onScroll={(event) => {
          const area = event.currentTarget;
          nearBottomRef.current = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
          if (area.scrollTop < 100 && hasMore && !loadingOlderRef.current) {
            loadingOlderRef.current = true;
            scrollRestoreRef.current = { height: area.scrollHeight, top: area.scrollTop };
            void loadOlder()
              .then((loaded) => {
                if (!loaded) scrollRestoreRef.current = null;
              })
              .finally(() => {
                loadingOlderRef.current = false;
              });
          }
        }}
        className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto p-4"
      >
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma mensagem ainda. Comece a conversa!
          </p>
        )}

        {messages.map(renderMessage)}

        {typingNames.length > 0 && (
          <TypingBubble
            label={
              typingNames.length === 1 ? typingNames[0] : `${typingNames.slice(0, 2).join(', ')}`
            }
          />
        )}

        <div ref={bottomRef} />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border/70 bg-card p-3 md:p-4">
        <input
          ref={imageInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e, 'image')}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
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
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <Input
          placeholder={uploadingImage ? 'Enviando imagem…' : 'Digite uma mensagem...'}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim()) pingTyping();
            else stopTyping();
          }}
          onBlur={stopTyping}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
          onPaste={handlePaste}
          className="min-w-0 text-sm"
        />

        <Button onClick={handleSend} disabled={!text.trim()} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
      {/* Chat image enlarged modal */}
      <Dialog
        open={Boolean(enlargedImage)}
        onOpenChange={(opened) => {
          if (!opened) setEnlargedImage(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-[95vw] p-2">
          <DialogTitle className="sr-only">Imagem ampliada</DialogTitle>
          <DialogDescription className="sr-only">Imagem enviada no chat de grupo</DialogDescription>
          {enlargedImage && (
            <SafeChatImage
              src={enlargedImage}
              alt="Imagem ampliada"
              className="max-h-[85vh] w-full rounded-xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GroupChatPanel;
