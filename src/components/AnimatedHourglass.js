import './AnimatedHourglass.css';

// Animated version of HourglassIcon. SVG + CSS keyframes, no library.
function AnimatedHourglass({ size = 56 }) {
  return (
    <svg
      className="hg"
      width={size}
      height={size * 1.3}
      viewBox="0 0 100 130"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Mmerℇ"
    >
      <defs>
        <clipPath id="hgTopClip">
          <polygon points="24,12 76,12 51,60 49,60" />
        </clipPath>
        <clipPath id="hgBottomClip">
          <polygon points="49,70 51,70 76,118 24,118" />
        </clipPath>
      </defs>

      {/* glass frame */}
      <g className="hg-frame" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="16" y1="10" x2="84" y2="10" />
        <line x1="16" y1="120" x2="84" y2="120" />
        <path d="M22 10c0 34 28 38 28 55 0-17 28-21 28-55" />
        <path d="M22 120c0-34 28-38 28-55 0 17 28 21 28 55" />
      </g>

      {/* sand */}
      <rect className="hg-sand hg-sand-top" x="24" y="12" width="52" height="48" clipPath="url(#hgTopClip)" />
      <rect className="hg-sand hg-sand-bottom" x="24" y="70" width="52" height="48" clipPath="url(#hgBottomClip)" />

      {/* falling stream */}
      <circle className="hg-grain hg-grain-1" cx="50" cy="63" r="1.6" />
      <circle className="hg-grain hg-grain-2" cx="50" cy="63" r="1.3" />
      <circle className="hg-grain hg-grain-3" cx="50" cy="63" r="1.8" />
    </svg>
  );
}

export default AnimatedHourglass;
