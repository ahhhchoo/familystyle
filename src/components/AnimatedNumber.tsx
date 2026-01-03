'use client';

import { useState, useEffect, useRef } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  suffix?: string;
  className?: string;
}

// Single digit roller
function Digit({ value }: { value: number }) {
  return (
    <span className="inline-block h-[1em] overflow-hidden align-top">
      <span 
        className="flex flex-col"
        style={{ 
          transform: `translateY(${-value * 1}em)`,
          transition: 'transform 0.5s cubic-bezier(0.33, 1, 0.68, 1)',
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span key={n} className="h-[1em] leading-[1em]">{n}</span>
        ))}
      </span>
    </span>
  );
}

export default function AnimatedNumber({ 
  value, 
  duration = 1000, 
  suffix = '',
  className = ''
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    const startValue = hasAnimatedRef.current ? displayValue : 0;
    const endValue = value;
    
    if (startValue === endValue && hasAnimatedRef.current) return;
    
    hasAnimatedRef.current = true;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      const current = Math.round(startValue + (endValue - startValue) * eased);
      
      setDisplayValue(current);
      
      if (t < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  // Split into individual digits
  const digits = String(displayValue).split('').map(d => parseInt(d));

  return (
    <span className={className}>
      {digits.map((digit, i) => (
        <Digit key={`${digits.length}-${i}`} value={digit} />
      ))}
      {suffix}
    </span>
  );
}
