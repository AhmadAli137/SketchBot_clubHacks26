export function AiboticsLogo({ size = 32 }: { size?: number }) {
  const id = `al-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-label="Aibotics">
      <rect x="1" y="1" width="38" height="38" rx="10" fill={`url(#${id}-bg)`} stroke={`url(#${id}-bd)`} strokeWidth="0.5"/>
      <path d="M10 31 C10 22 14 13 20 8" stroke={`url(#${id}-l)`} strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      <path d="M30 31 C30 22 26 13 20 8" stroke={`url(#${id}-r)`} strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      <line x1="13.8" y1="21.5" x2="26.2" y2="21.5" stroke="#5de4ff" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2.8 1.8" opacity="0.82"/>
      <circle cx="13.8" cy="21.5" r="2" fill="#6366f1"/>
      <circle cx="26.2" cy="21.5" r="2" fill="#5de4ff"/>
      <circle cx="20" cy="8" r="3.4" fill={`url(#${id}-core)`}/>
      <circle cx="20" cy="8" r="1.45" fill="white" opacity="0.92"/>
      <circle cx="14.5" cy="29.5" r="1.9" fill="#6366f1" opacity="0.85"/>
      <circle cx="25.5" cy="29.5" r="1.9" fill="#6366f1" opacity="0.85"/>
      <defs>
        <linearGradient id={`${id}-bg`} x1="1" y1="1" x2="39" y2="39" gradientUnits="userSpaceOnUse">
          <stop stopColor="#040c1e"/><stop offset="1" stopColor="#07122a"/>
        </linearGradient>
        <linearGradient id={`${id}-bd`} x1="1" y1="1" x2="39" y2="39" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" stopOpacity="0.65"/><stop offset="1" stopColor="#5de4ff" stopOpacity="0.3"/>
        </linearGradient>
        <linearGradient id={`${id}-l`} x1="10" y1="31" x2="20" y2="8" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1"/><stop offset="1" stopColor="#5de4ff"/>
        </linearGradient>
        <linearGradient id={`${id}-r`} x1="30" y1="31" x2="20" y2="8" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b5cf6"/><stop offset="1" stopColor="#5de4ff"/>
        </linearGradient>
        <radialGradient id={`${id}-core`} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#a8f4ff"/><stop offset="100%" stopColor="#5de4ff"/>
        </radialGradient>
      </defs>
    </svg>
  );
}
