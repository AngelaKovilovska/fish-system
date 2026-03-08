import { useId } from 'react';

const AnimatedFish = ({ width = "100%", height = "auto", className = "" }) => {
  const uid = useId().replace(/:/g, '');
  const gradId = `fishGrad${uid}`;

  return (
    <svg
      viewBox="0 0 500 140"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width, height, overflow: "visible", display: "block" }}
      className={className}
      aria-label="Animated fish"
      role="img"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.03" />
          <stop offset="40%" stopColor="#00D4FF" stopOpacity="0.11" />
          <stop offset="80%" stopColor="#00D4FF" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#00D4FF" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <style>{`
        .fish-tail-${uid} {
          transform-box: fill-box;
          transform-origin: right center;
          animation: tailWag 0.75s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite alternate;
        }
        .fish-dorsal-${uid} {
          transform-box: fill-box;
          transform-origin: bottom center;
          animation: dorsalWave 1.6s ease-in-out infinite alternate;
        }
        @keyframes tailWag {
          from { transform: rotate(-18deg); }
          to   { transform: rotate( 18deg); }
        }
        @keyframes dorsalWave {
          from { transform: rotate(-3deg) scaleY(0.9); }
          to   { transform: rotate( 3deg) scaleY(1.08); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fish-tail-${uid}, .fish-dorsal-${uid} { animation: none; }
        }
      `}</style>
      <g>
        {/* Tail */}
        <path
          className={`fish-tail-${uid}`}
          d={`
            M 200,70
            C 182,48  150,33  118,27
            C 144,55  155,65  160,70
            C 155,75  144,85  118,113
            C 150,107 182,92  200,70 Z
          `}
          fill="rgba(0,212,255,0.06)"
          stroke="#00D4FF"
          strokeWidth="1.55"
          strokeLinejoin="round"
        />
        {/* Body */}
        <path
          d={`
            M 200,70
            C 206,40  252,31  291,42
            C 321,50  341,62  342,70
            C 341,78  321,90  291,98
            C 252,109 206,100 200,70 Z
          `}
          fill={`url(#${gradId})`}
          stroke="#00D4FF"
          strokeWidth="1.85"
          strokeLinejoin="round"
        />
        {/* Dorsal fin */}
        <path
          className={`fish-dorsal-${uid}`}
          d={`
            M 238,44
            C 245,16  275,10  285,25
            C 277,37  260,42  248,45 Z
          `}
          fill="rgba(0,212,255,0.07)"
          stroke="#00D4FF"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        {/* Lower fin 1 */}
        <path
          d={`
            M 262,74
            C 253,97  234,104  227,96
            C 237,88  251,82   262,74 Z
          `}
          fill="rgba(0,212,255,0.07)"
          stroke="#00D4FF"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        {/* Lower fin 2 */}
        <path
          d={`
            M 222,95
            C 218,112 208,116  204,110
            C 210,104 218,100  222,95 Z
          `}
          fill="rgba(0,212,255,0.05)"
          stroke="#00D4FF"
          strokeWidth="1.1"
          strokeLinejoin="round"
          opacity="0.75"
        />
        {/* Gill line */}
        <path
          d="M 295,44 Q 286,70 295,96"
          fill="none"
          stroke="#00D4FF"
          strokeWidth="1.25"
          strokeLinecap="round"
          opacity="0.65"
        />
        {/* Body line */}
        <path
          d="M 208,68 Q 264,63  330,67"
          fill="none"
          stroke="#00D4FF"
          strokeWidth="0.75"
          strokeLinecap="round"
          opacity="0.38"
        />
        {/* Scale detail 1 */}
        <path
          d="M 248,52 Q 256,60 248,68"
          fill="none"
          stroke="#00D4FF"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity="0.28"
        />
        {/* Scale detail 2 */}
        <path
          d="M 267,48 Q 276,58 267,68"
          fill="none"
          stroke="#00D4FF"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity="0.22"
        />
        {/* Eye */}
        <circle cx="319" cy="62" r="6" fill="rgba(0,212,255,0.10)" stroke="#00D4FF" strokeWidth="1.45" />
        <circle cx="319" cy="62" r="2.8" fill="#00D4FF" opacity="0.95" />
        <circle cx="321" cy="60.5" r="1.1" fill="white" opacity="0.55" />
        {/* Mouth */}
        <path
          d="M 340,67 Q 347,70 340,73"
          fill="none"
          stroke="#00D4FF"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
};

export default AnimatedFish;
