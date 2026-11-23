import { useEffect, useRef, type ReactNode } from 'react';

// Basit, erişilebilir pencere: Esc kapatır, odak içeride kalır, kapanınca odak eski yerine döner.
export function Dialog({
  label,
  onClose,
  className = '',
  children
}: {
  label: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const box = ref.current!;
    const first = box.querySelector<HTMLElement>('[data-autofocus]') ?? box.querySelector<HTMLElement>('button, input, a[href]');
    first?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab') {
        const items = [...box.querySelectorAll<HTMLElement>('button, input, a[href], [tabindex="0"]')].filter((el) => !el.hasAttribute('disabled'));
        if (!items.length) return;
        const a = items[0], z = items[items.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    }
    box.addEventListener('keydown', onKey);
    return () => {
      box.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} className={'dialog ' + className}>
        {children}
      </div>
    </div>
  );
}
