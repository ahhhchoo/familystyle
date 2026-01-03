'use client';

interface SkeletonProps {
  className?: string;
}

export default function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`bg-[var(--gray-dark)] ${className}`}
      style={{
        background: 'linear-gradient(90deg, #1C1C1E 25%, #2C2C2E 50%, #1C1C1E 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
      }}
    />
  );
}
