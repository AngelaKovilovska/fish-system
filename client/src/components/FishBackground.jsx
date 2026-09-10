import AnimatedFish from './AnimatedFish';

const FISH = [
  /* ── Група 1: горе, заедно тргнуваат ── */
  { size: 200, top: '15%', duration: 22, delay: 0,  opacity: 1 },
  { size: 110, top: '22%', duration: 20, delay: 1.5, opacity: 0.7 },
  { size: 75,  top: '12%', duration: 23, delay: 0.8, opacity: 0.5 },

  /* ── Група 2: средина, со мал раздел ── */
  { size: 160, top: '42%', duration: 18, delay: 6,  opacity: 0.8 },
  { size: 90,  top: '48%', duration: 16, delay: 7,  opacity: 0.6 },
  { size: 65,  top: '38%', duration: 19, delay: 5.5, opacity: 0.45 },

  /* ── Група 3: долу, побавни ── */
  { size: 130, top: '68%', duration: 25, delay: 12, opacity: 0.65 },
  { size: 85,  top: '74%', duration: 22, delay: 13.5, opacity: 0.5 },
  { size: 55,  top: '65%', duration: 26, delay: 11, opacity: 0.35 },

  /* ── Група 4: дно, ситни и суптилни ── */
  { size: 100, top: '85%', duration: 20, delay: 17, opacity: 0.5 },
  { size: 60,  top: '90%', duration: 17, delay: 18.5, opacity: 0.35 },
  { size: 45,  top: '82%', duration: 21, delay: 16, opacity: 0.3 },
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
