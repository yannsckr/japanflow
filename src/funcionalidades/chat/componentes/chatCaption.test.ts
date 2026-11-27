import { expect, it } from 'vitest';
import { showChatCaption } from './chatCaption';
it('hides only the generated image caption', () => {
  expect(showChatCaption('\u{1F4F7} Imagem', 'image', true, false)).toBe(false);
  expect(showChatCaption('Foto do pedido', 'image', true, false)).toBe(true);
  expect(showChatCaption('\u{1F4F7} Imagem', 'file', true, false)).toBe(true);
  expect(showChatCaption('Mensagem excluida', 'image', true, true)).toBe(true);
});
