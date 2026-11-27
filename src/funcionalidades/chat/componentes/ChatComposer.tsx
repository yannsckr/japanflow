import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { Textarea } from '@/components/ui/textarea';

export default function ChatComposer(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      const height = Math.max(42, Math.min(144, el.scrollHeight + 2));
      el.style.height = `${height}px`;
      el.style.overflowY = el.scrollHeight + 2 > 144 ? 'auto' : 'hidden';
    };
    fit();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (width !== el.clientWidth) {
        width = el.clientWidth;
        fit();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [props.value]);
  return (
    <Textarea
      {...props}
      ref={ref}
      rows={1}
      className="jf-chat-composer min-h-[42px] max-h-36 min-w-0 flex-1 resize-none py-2.5 leading-5"
    />
  );
}
