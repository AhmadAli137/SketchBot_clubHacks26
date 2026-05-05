import { ImageResponse } from 'next/og';

// Apple touch icon — used when an iOS user taps "Add to Home Screen" on
// sayspark.ca. iOS requires a raster image (no SVG), and 180×180 is the
// standard size that gets scaled down for older devices. Rendering via
// ImageResponse means we don't need to commit a binary PNG to the repo —
// Next.js compiles this to a PNG at build/serve time. Re-renders for
// free if we ever tweak the brand colors.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Dark navy backdrop so the gradient spark stays vibrant on
          // both light and dark home-screen wallpapers. iOS auto-rounds
          // the corners.
          background: 'radial-gradient(circle at center, #1a2040 0%, #0a0d18 70%)',
        }}
      >
        <svg width="140" height="140" viewBox="0 0 32 32" fill="none">
          <defs>
            <radialGradient id="apple-halo" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="#5de4ff" stopOpacity="0.55" />
              <stop offset="60%" stopColor="#a855f7" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#5de4ff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="apple-spark" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="#fff4d6" />
              <stop offset="35%" stopColor="#5de4ff" />
              <stop offset="100%" stopColor="#a855f7" />
            </radialGradient>
            <radialGradient id="apple-core" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#5de4ff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="16" cy="16" r="15" fill="url(#apple-halo)" />
          <g transform="translate(16 16)">
            <path
              d="M 0 -13 L 3 -3 L 13 0 L 3 3 L 0 13 L -3 3 L -13 0 L -3 -3 Z"
              fill="url(#apple-spark)"
            />
            <path
              d="M 0 -6 L 1.4 -1.4 L 6 0 L 1.4 1.4 L 0 6 L -1.4 1.4 L -6 0 L -1.4 -1.4 Z"
              transform="rotate(45)"
              fill="#ffffff"
              fillOpacity="0.50"
            />
            <circle cx="0" cy="0" r="3.6" fill="url(#apple-core)" fillOpacity="0.65" />
            <circle cx="0" cy="0" r="2.0" fill="#ffffff" fillOpacity="0.96" />
            <circle cx="6.5" cy="-5.5" r="0.7" fill="#ffffff" fillOpacity="0.80" />
            <circle cx="-7.0" cy="6.0" r="0.6" fill="#ffffff" fillOpacity="0.65" />
            <circle cx="-5.5" cy="-5.0" r="0.4" fill="#ffffff" fillOpacity="0.55" />
          </g>
        </svg>
      </div>
    ),
    { ...size },
  );
}
