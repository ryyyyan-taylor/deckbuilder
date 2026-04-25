// Inline SVG icons for segmented control

export const GameIconMtg = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    {/* Simple MTG mana symbol approximation: circle with point at top */}
    <circle cx="12" cy="13" r="8" />
    <polygon points="12,4 14,10 10,10" />
  </svg>
)

export const GameIconSwu = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    {/* Simple Star Wars icon: X shape (cross) */}
    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)
