function GrapeIcon({ size = 40 }: { size?: number }) {
  const grapes = [
    [22, 19],
    [15, 27],
    [29, 27],
    [8, 35],
    [22, 35],
    [36, 35],
    [15, 43],
    [29, 43],
  ]

  return (
    <svg width={size} height={size} viewBox="0 0 44 52" fill="none" aria-hidden="true">
      <line x1="22" y1="3" x2="22" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M22,12 Q14,7 9,12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M22,12 Q30,7 35,12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {grapes.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" fill="currentColor" />
      ))}
    </svg>
  )
}

export default GrapeIcon
