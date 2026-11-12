import type { ReactNode } from 'react';

/** URLs http(s) da mensagem viram links; o texto permanece escapado pelo React. */
export function ChatRichText({ text }: { text: string }) {
  const pieces: ReactNode[] = [];
  const matcher = /https?:\/\/[^\s<>"']+/gi;
  let last = 0;
  let result: RegExpExecArray | null;
  while ((result = matcher.exec(text))) {
    const raw = result[0];
    const urlText = raw.replace(/[.,;:!?)]*$/, '');
    if (result.index > last) pieces.push(text.slice(last, result.index));
    try {
      const url = new URL(urlText);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol');
      pieces.push(
        <a
          key={`${result.index}-${urlText}`}
          href={url.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 break-all"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {urlText}
        </a>
      );
    } catch {
      pieces.push(urlText);
    }
    if (urlText.length < raw.length) pieces.push(raw.slice(urlText.length));
    last = result.index + raw.length;
  }
  if (last < text.length) pieces.push(text.slice(last));
  return <>{pieces}</>;
}
