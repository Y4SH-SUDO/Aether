import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

export function useCountUp(target: number, duration = 700): number {
  const reducedMotion = useReducedMotion();
  const [value, setValue] = useState(target);
  const displayedValue = useRef(target);

  useEffect(() => {
    if (reducedMotion) {
      displayedValue.current = target;
      return;
    }

    const start = displayedValue.current;
    const startedAt = performance.now();
    let frame = 0;

    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const nextValue = start + (target - start) * eased;
      displayedValue.current = nextValue;
      setValue(nextValue);
      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        displayedValue.current = target;
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [duration, reducedMotion, target]);

  return reducedMotion ? target : value;
}
