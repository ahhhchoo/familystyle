'use client';

import { useState, useEffect, useRef } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  suffix?: string;
  className?: string;
}

// Single rolling digit component
function RollingDigit({ digit, duration }: { digit: string; duration: number }) {
  const [offset, setOffset] = useState(0);
  const prevDigitRef = useRef(digit);
  
  useEffect(() => {
    if (digit === prevDigitRef.current) return;
    
    const targetOffset = digit === '-' ? 10 : parseInt(digit);
    const startOffset = offset;
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease out quart
      const eased = 1 - Math.pow(1 - t, 4);
      const current = startOffset + (targetOffset - startOffset) * eased;
      
      setOffset(current);
      
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        prevDigitRef.current = digit;
      }
    };
    
    requestAnimationFrame(animate);
  }, [digit, duration]);
  
  // On first render, set to correct position
  useEffect(() => {
    const targetOffset = digit === '-' ? 10 : parseInt(digit);
    setOffset(targetOffset);
  }, []);
  
  return (
    <span className="inline-block h-[1em] overflow-hidden relative" style={{ width: '0.6em' }}>
      <span 
        className="inline-block transition-none"
        style={{ 
          transform: `translateY(${-offset * 1}em)`,
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span key={n} className="block h-[1em] leading-[1em]">{n}</span>
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
  const [displayValue, setDisplayValue] = useState(value);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    // Always animate from current display to new value
    const startValue = hasAnimatedRef.current ? displayValue : 0;
    const endValue = value;
    
    // Skip if no change and already animated once
    if (startValue === endValue && hasAnimatedRef.current) return;
    
    hasAnimatedRef.current = true;
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
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  const digits = String(displayValue).split('');

  return (
    <span className={`inline-flex ${className}`}>
      {digits.map((digit, i) => (
        <RollingDigit key={i} digit={digit} duration={duration / 2} />
      ))}
      {suffix}
    </span>
  );
}
