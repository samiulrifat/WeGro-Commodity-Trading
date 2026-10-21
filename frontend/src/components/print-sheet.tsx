import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * Prints only `children`: they go outside the app (no menu or header on
 * paper), the print dialog opens once their images are ready, and `onDone`
 * runs when it closes. `className` sets the paper layout (see index.css).
 */
export function PrintSheet({
  children,
  className,
  onDone,
}: {
  children: ReactNode;
  className?: string;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  useLayoutEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    let cancelled = false;
    const finish = () => done.current();
    document.body.classList.add('printing');
    const images = [...(ref.current?.querySelectorAll('img') ?? [])];
    const sources = new Map(images.map((i) => [i.src, i]));
    void Promise.all(
      [...sources.values()].map((i) =>
        Promise.resolve(i.decode?.()).catch(() => undefined),
      ),
    ).then(() => {
      if (cancelled) return;
      window.addEventListener('afterprint', finish, { once: true });
      window.print();
    });
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', finish);
      document.body.classList.remove('printing');
    };
  }, []);
  return createPortal(
    <div ref={ref} className={cn('print-sheet', className)}>
      {children}
    </div>,
    document.body,
  );
}
