import { useId } from 'react';

/**
 * Decorative SVG illustration of two koi fish swimming in a circular
 * yin-yang arrangement — matching the user's reference image.
 * Light blue koi on top, dark navy koi on bottom.
 */
export default function KoiFishDecoration({ width = 200, height = 200, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const g = (name) => `${name}-${uid}`;

  return (
    <svg
      viewBox="0 0 240 240"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width, height, overflow: 'visible', display: 'block' }}
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* ── Light koi gradients ── */}
        <linearGradient id={g('lb')} x1="0%" y1="0%" x2="100%" y2="80%">
          <stop offset="0%" stopColor="#B8DEF5" />
          <stop offset="40%" stopColor="#7CC1E8" />
          <stop offset="100%" stopColor="#4FA3D4" />
        </linearGradient>
        <linearGradient id={g('lt')} x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stopColor="#A8D8F0" />
          <stop offset="100%" stopColor="#6BB5DB" />
        </linearGradient>
        <linearGradient id={g('lf')} x1="0%" y1="30%" x2="100%" y2="70%">
          <stop offset="0%" stopColor="#B8DEF5" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7CC1E8" stopOpacity="0.6" />
        </linearGradient>

        {/* ── Dark koi gradients ── */}
        <linearGradient id={g('db')} x1="100%" y1="0%" x2="0%" y2="80%">
          <stop offset="0%" stopColor="#1B4F7A" />
          <stop offset="40%" stopColor="#1A3D6B" />
          <stop offset="100%" stopColor="#14325A" />
        </linearGradient>
        <linearGradient id={g('dt')} x1="70%" y1="0%" x2="30%" y2="100%">
          <stop offset="0%" stopColor="#1B4F7A" />
          <stop offset="100%" stopColor="#1A3D6B" />
        </linearGradient>
        <linearGradient id={g('df')} x1="100%" y1="30%" x2="0%" y2="70%">
          <stop offset="0%" stopColor="#1B4F7A" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#14325A" stopOpacity="0.7" />
        </linearGradient>
      </defs>

      <style>{`
        .${g('sa')} {
          transform-origin: 120px 120px;
          animation: ${g('ka')} 6s ease-in-out infinite;
        }
        .${g('sb')} {
          transform-origin: 120px 120px;
          animation: ${g('kb')} 6s ease-in-out infinite;
        }
        .${g('ta')} {
          transform-box: fill-box;
          transform-origin: 85% 50%;
          animation: ${g('tw')} 1s ease-in-out infinite alternate;
        }
        .${g('tb')} {
          transform-box: fill-box;
          transform-origin: 15% 50%;
          animation: ${g('tw')} 1.2s ease-in-out infinite alternate-reverse;
        }
        @keyframes ${g('ka')} {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(2deg); }
        }
        @keyframes ${g('kb')} {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-2deg); }
        }
        @keyframes ${g('tw')} {
          from { transform: rotate(-8deg); }
          to   { transform: rotate(8deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .${g('sa')}, .${g('sb')},
          .${g('ta')}, .${g('tb')} { animation: none; }
        }
      `}</style>

      {/* ════════════════════════════════════════════
           KOI A — LIGHT BLUE (top, swimming down-right)
           ════════════════════════════════════════════ */}
      <g className={g('sa')}>
        {/* Main body */}
        <path
          d="M 155,52 C 168,58 178,72 180,85 C 182,100 172,108 155,112
             C 138,116 115,115 95,108 C 78,102 68,92 65,82
             C 62,72 68,60 80,54 C 95,47 135,44 155,52 Z"
          fill={`url(#${g('lb')})`}
        />

        {/* Head (slightly larger, overlapping body front) */}
        <ellipse cx="172" cy="83" rx="16" ry="18"
          fill={`url(#${g('lb')})`}
        />

        {/* Scale pattern — rows of arcs on the body */}
        <g opacity="0.25" fill="none" stroke="#3A8BBF" strokeWidth="0.8">
          <path d="M 100,70 Q 106,64 112,70" />
          <path d="M 112,70 Q 118,64 124,70" />
          <path d="M 124,70 Q 130,64 136,70" />
          <path d="M 136,70 Q 142,64 148,70" />
          <path d="M 95,80 Q 101,74 107,80" />
          <path d="M 107,80 Q 113,74 119,80" />
          <path d="M 119,80 Q 125,74 131,80" />
          <path d="M 131,80 Q 137,74 143,80" />
          <path d="M 143,80 Q 149,74 155,80" />
          <path d="M 90,90 Q 96,84 102,90" />
          <path d="M 102,90 Q 108,84 114,90" />
          <path d="M 114,90 Q 120,84 126,90" />
          <path d="M 126,90 Q 132,84 138,90" />
          <path d="M 138,90 Q 144,84 150,90" />
          <path d="M 88,100 Q 94,94 100,100" />
          <path d="M 100,100 Q 106,94 112,100" />
          <path d="M 112,100 Q 118,94 124,100" />
          <path d="M 124,100 Q 130,94 136,100" />
        </g>

        {/* Dorsal fin */}
        <path
          d="M 120,54 C 115,38 128,30 140,36 C 148,40 150,50 148,56"
          fill={`url(#${g('lf')})`}
          stroke="#5CAED4" strokeWidth="0.5" strokeOpacity="0.4"
        />

        {/* Pectoral fin (lower) */}
        <path
          d="M 135,108 C 128,122 118,128 112,124 C 118,118 126,112 135,108 Z"
          fill={`url(#${g('lf')})`}
          stroke="#5CAED4" strokeWidth="0.5" strokeOpacity="0.3"
        />

        {/* Ventral fin */}
        <path
          d="M 108,106 C 104,116 96,120 94,116 C 98,112 104,108 108,106 Z"
          fill="#A8D8F0" fillOpacity="0.6"
        />

        {/* Tail (two flowing lobes) */}
        <g className={g('ta')}>
          <path
            d="M 68,78 C 55,62 42,50 32,48 C 38,58 40,70 36,80
               C 40,78 52,72 68,78 Z"
            fill={`url(#${g('lt')})`}
            stroke="#5CAED4" strokeWidth="0.4" strokeOpacity="0.3"
          />
          <path
            d="M 68,86 C 55,102 42,114 32,116 C 38,106 40,94 36,84
               C 40,86 52,92 68,86 Z"
            fill={`url(#${g('lt')})`}
            stroke="#5CAED4" strokeWidth="0.4" strokeOpacity="0.3"
          />
        </g>

        {/* Eye */}
        <circle cx="178" cy="78" r="4" fill="white" opacity="0.6" />
        <circle cx="178" cy="78" r="2.5" fill="#1A3D6B" opacity="0.8" />
        <circle cx="179.5" cy="77" r="0.8" fill="white" opacity="0.7" />

        {/* Whiskers / barbels */}
        <path d="M 186,80 C 196,74 204,68 210,62" fill="none"
          stroke="#5CAED4" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
        <path d="M 186,86 C 196,90 202,96 206,104" fill="none"
          stroke="#5CAED4" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
        <path d="M 184,82 C 194,80 202,78 208,74" fill="none"
          stroke="#5CAED4" strokeWidth="0.6" strokeLinecap="round" opacity="0.35" />
        <path d="M 184,84 C 192,88 198,94 202,100" fill="none"
          stroke="#5CAED4" strokeWidth="0.6" strokeLinecap="round" opacity="0.35" />

        {/* Gill line */}
        <path d="M 160,68 Q 156,82 160,96" fill="none"
          stroke="#4A9CC4" strokeWidth="0.8" strokeOpacity="0.3" strokeLinecap="round" />
      </g>

      {/* ════════════════════════════════════════════
           KOI B — DARK NAVY (bottom, swimming up-left)
           ════════════════════════════════════════════ */}
      <g className={g('sb')}>
        {/* Main body */}
        <path
          d="M 85,188 C 72,182 62,168 60,155 C 58,140 68,132 85,128
             C 102,124 125,125 145,132 C 162,138 172,148 175,158
             C 178,168 172,180 160,186 C 145,193 105,196 85,188 Z"
          fill={`url(#${g('db')})`}
        />

        {/* Head */}
        <ellipse cx="68" cy="157" rx="16" ry="18"
          fill={`url(#${g('db')})`}
        />

        {/* Scale pattern */}
        <g opacity="0.2" fill="none" stroke="#0F2E4D" strokeWidth="0.8">
          <path d="M 140,170 Q 134,176 128,170" />
          <path d="M 128,170 Q 122,176 116,170" />
          <path d="M 116,170 Q 110,176 104,170" />
          <path d="M 104,170 Q 98,176 92,170" />
          <path d="M 145,160 Q 139,166 133,160" />
          <path d="M 133,160 Q 127,166 121,160" />
          <path d="M 121,160 Q 115,166 109,160" />
          <path d="M 109,160 Q 103,166 97,160" />
          <path d="M 97,160 Q 91,166 85,160" />
          <path d="M 150,150 Q 144,156 138,150" />
          <path d="M 138,150 Q 132,156 126,150" />
          <path d="M 126,150 Q 120,156 114,150" />
          <path d="M 114,150 Q 108,156 102,150" />
          <path d="M 102,150 Q 96,156 90,150" />
          <path d="M 152,140 Q 146,146 140,140" />
          <path d="M 140,140 Q 134,146 128,140" />
          <path d="M 128,140 Q 122,146 116,140" />
          <path d="M 116,140 Q 110,146 104,140" />
        </g>

        {/* Dorsal fin */}
        <path
          d="M 120,186 C 125,202 112,210 100,204 C 92,200 90,190 92,184"
          fill={`url(#${g('df')})`}
          stroke="#14325A" strokeWidth="0.5" strokeOpacity="0.4"
        />

        {/* Pectoral fin (upper) */}
        <path
          d="M 105,132 C 112,118 122,112 128,116 C 122,122 114,128 105,132 Z"
          fill={`url(#${g('df')})`}
          stroke="#14325A" strokeWidth="0.5" strokeOpacity="0.3"
        />

        {/* Ventral fin */}
        <path
          d="M 132,134 C 136,124 144,120 146,124 C 142,128 136,132 132,134 Z"
          fill="#1A3D6B" fillOpacity="0.6"
        />

        {/* Tail (two flowing lobes) */}
        <g className={g('tb')}>
          <path
            d="M 172,162 C 185,178 198,190 208,192 C 202,182 200,170 204,160
               C 200,162 188,168 172,162 Z"
            fill={`url(#${g('dt')})`}
            stroke="#14325A" strokeWidth="0.4" strokeOpacity="0.3"
          />
          <path
            d="M 172,154 C 185,138 198,126 208,124 C 202,134 200,146 204,156
               C 200,154 188,148 172,154 Z"
            fill={`url(#${g('dt')})`}
            stroke="#14325A" strokeWidth="0.4" strokeOpacity="0.3"
          />
        </g>

        {/* Eye */}
        <circle cx="62" cy="152" r="4" fill="white" opacity="0.5" />
        <circle cx="62" cy="152" r="2.5" fill="#0A1E36" opacity="0.9" />
        <circle cx="60.5" cy="151" r="0.8" fill="white" opacity="0.5" />

        {/* Whiskers / barbels */}
        <path d="M 54,160 C 44,166 36,172 30,178" fill="none"
          stroke="#1A3D6B" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
        <path d="M 54,154 C 44,150 38,144 34,136" fill="none"
          stroke="#1A3D6B" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
        <path d="M 56,158 C 46,160 38,162 32,166" fill="none"
          stroke="#1A3D6B" strokeWidth="0.6" strokeLinecap="round" opacity="0.35" />
        <path d="M 56,156 C 48,152 42,146 38,140" fill="none"
          stroke="#1A3D6B" strokeWidth="0.6" strokeLinecap="round" opacity="0.35" />

        {/* Gill line */}
        <path d="M 80,172 Q 84,158 80,144" fill="none"
          stroke="#14325A" strokeWidth="0.8" strokeOpacity="0.3" strokeLinecap="round" />
      </g>
    </svg>
  );
}
