import { useEffect, useRef, type ReactNode } from 'react';
import styles from '../pages/map.module.css';

export function MapPanelBody({ children }: { children: ReactNode }) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const update = () => {
      element.dataset.scrollStart = String(element.scrollTop > 1);
      element.dataset.scrollEnd = String(
        element.scrollTop + element.clientHeight < element.scrollHeight - 1,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    element.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', update);
    };
  }, [children]);
  return (
    <div
      ref={scroll}
      className={styles.detailScroll}
      tabIndex={0}
      role="region"
      aria-label="Region and place stories"
    >
      <div className={styles.detailBody}>{children}</div>
    </div>
  );
}
