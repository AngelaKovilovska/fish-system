import AnimatedFish from './AnimatedFish';

const FISH = [
  { size: 260, top: '20%', duration: 22, delay: 0,  opacity: 1 },
  { size: 120, top: '50%', duration: 16, delay: 4,  opacity: 0.7 },
  { size: 80,  top: '75%', duration: 19, delay: 9,  opacity: 0.5 },
  { size: 140, top: '38%', duration: 26, delay: 13, opacity: 0.6 },
  { size: 65,  top: '62%', duration: 14, delay: 7,  opacity: 0.45 },
  { size: 55,  top: '88%', duration: 21, delay: 16, opacity: 0.35 },
];

export default function FishBackground({ variant = 'light' }) {
  const baseOpacity = variant === 'dark' ? 0.25 : 0.15;

  return (
    <div
      className="fish-bg-container"
      aria-hidden="true"
      style={{
        position: variant === 'dark' ? 'absolute' : 'fixed',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: variant === 'dark' ? 0 : 2,
      }}
    >
      {FISH.map((fish, i) => (
        <div
          key={i}
          className="fish-swim-across"
          style={{
            top: fish.top,
            animationDuration: `${fish.duration}s`,
            animationDelay: `${fish.delay}s`,
            opacity: baseOpacity * fish.opacity,
          }}
        >
          <div
            className="fish-float"
            style={{
              animationDuration: `${3 + i * 0.7}s`,
              animationDelay: `${i * 0.5}s`,
            }}
          >
            <AnimatedFish width={fish.size} height="auto" />
          </div>
        </div>
      ))}

      {/* Subtle bubbles */}
      <div className="fish-bubble" style={{
        left: '28%', animationDelay: '4s', animationDuration: '12s',
        width: 5, height: 5, opacity: variant === 'dark' ? 0.18 : 0.08,
      }} />
      <div className="fish-bubble" style={{
        left: '52%', animationDelay: '9s', animationDuration: '15s',
        width: 3, height: 3, opacity: variant === 'dark' ? 0.14 : 0.06,
      }} />
      <div className="fish-bubble" style={{
        left: '78%', animationDelay: '1s', animationDuration: '18s',
        width: 6, height: 6, opacity: variant === 'dark' ? 0.12 : 0.05,
      }} />

      <style>{`
        @media (max-width: 1023px) {
          .fish-bg-container .fish-swim-across { transform: scale(0.65); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fish-bg-container { display: none; }
        }
      `}</style>
    </div>
  );
}
