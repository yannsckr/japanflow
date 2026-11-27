export function showChatCaption(
  content: string | null | undefined,
  type: string | null | undefined,
  hasAttachment: boolean,
  deleted: boolean
): boolean {
  if (deleted || type !== 'image' || !hasAttachment) return true;
  return !['', '\u{1F4F7} Imagem', '\u{1F5BC}\uFE0F Imagem', '\u{1F5BC} Imagem'].includes(
    (content || '').trim()
  );
}
