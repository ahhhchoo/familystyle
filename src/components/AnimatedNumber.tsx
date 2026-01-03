'use client';

import { useState, useEffect, useRef } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  suffix?: string;
  className?: string;
}

export default function AnimatedNumber({ 
  value, 
  duration = 1000, 
  suffix = '',
  className = ''
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);

  useEffect(() => {
    const startValue = previousValueRef.current;
    const endValue = value;
    
    // Skip if no change
    if (startValue === endValue) return;
    
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease out quart - smoother and slower feeling
      const eased = 1 - Math.pow(1 - t, 4);
      const current = Math.round(startValue + (endValue - startValue) * eased);
      
      setDisplayValue(current);
      
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        previousValueRef.current = endValue;
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return (
    <span className={className}>
      {displayValue}{suffix}
    </span>
  );
}
