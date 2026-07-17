export default function Logo({ size = 28, white = false }: { size?: number; white?: boolean }) {
  const ink = white ? "#ffffff" : "#3347e0";
  const paper = white ? "#3347e0" : "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className="pixel-snap">
      {/* pixel football */}
      <circle cx="16" cy="16" r="14" fill={ink} />
      {/* pentagon patch */}
      <path d="M16 8l5 4-2 6h-6l-2-6 5-4Z" fill={paper} />
      {/* seams */}
      <path d="M16 8V3M21 12l5-2M18.6 18.5 22 23M13 18.5 9.5 23M11 12 6 10" stroke={paper} strokeWidth="1.6" />
    </svg>
  );
}
