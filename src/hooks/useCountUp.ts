import { useEffect, useRef, useState } from 'react';

export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(target);
  const previous = useRef(target);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      previous.current = target;
      setValue(target);
      return;
    }

    const start = previous.current;
    const startedAt = performance.now();
    let frame = 0;

    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setValue(start + (target - start) * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        previous.current = target;
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [duration, target]);

  return value;
}
