import { useLayoutEffect, useRef, useState } from 'react';

/** Kabın genişliğini izler; grafikler yazı boyutu bozulmadan gerçek piksel genişliğinde çizilir */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
