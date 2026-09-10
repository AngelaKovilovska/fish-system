import AnimatedFish from './AnimatedFish';

const FISH = [
  /* ── Група 1: горе ── */
  { size: 220, top: '12%', duration: 22, delay: 0,   opacity: 1 },
  { size: 120, top: '20%', duration: 19, delay: 1.2, opacity: 0.85 },
  { size: 80,  top: '8%',  duration: 24, delay: 0.5, opacity: 0.7 },

  /* ── Група 2: средина ── */
  { size: 180, top: '40%', duration: 17, delay: 5,   opacity: 0.95 },
  { size: 100, top: '46%', duration: 15, delay: 6.5, opacity: 0.75 },
  { size: 70,  top: '35%', duration: 18, delay: 4.5, opacity: 0.6 },

  /* ── Група 3: долу ── */
  { size: 150, top: '65%', duration: 24, delay: 10,  opacity: 0.9 },
  { size: 95,  top: '72%', duration: 21, delay: 11.5, opacity: 0.7 },
  { size: 60,  top: '62%', duration: 25, delay: 9,   opacity: 0.55 },

  /* ── Група 4: дно ── */
  { size: 110, top: '84%', duration: 19, delay: 15,  opacity: 0.8 },
  { size: 65,  top: '90%', duration: 16, delay: 16.5, opacity: 0.6 },
  { size: 50,  top: '80%', duration: 20, delay: 14,  opacity: 0.5 },
];

export default function FishBackground({ variant = 'light' }) {
  const baseOpacity = variant === 'dark' ? 0.3 : 0.35;

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

      {/* Bubbles */}
      <div className="fish-bubble" style={{
        left: '15%', animationDelay: '2s', animationDuration: '10s',
        width: 5, height: 5, opacity: variant === 'dark' ? 0.2 : 0.12,
      }} />
      <div className="fish-bubble" style={{
        left: '30%', animationDelay: '5s', animationDuration: '12s',
        width: 4, height: 4, opacity: variant === 'dark' ? 0.18 : 0.1,
      }} />
      <div className="fish-bubble" style={{
        left: '50%', animationDelay: '8s', animationDuration: '14s',
        width: 6, height: 6, opacity: variant === 'dark' ? 0.16 : 0.09,
      }} />
      <div className="fish-bubble" style={{
        left: '68%', animationDelay: '1s', animationDuration: '11s',
        width: 3, height: 3, opacity: variant === 'dark' ? 0.2 : 0.11,
      }} />
      <div className="fish-bubble" style={{
        left: '82%', animationDelay: '6s', animationDuration: '16s',
        width: 5, height: 5, opacity: variant === 'dark' ? 0.14 : 0.08,
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
