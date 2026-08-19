/**
 * One glyph per task type. Drawn, not emoji — emoji render differently on
 * every OS and read as filler; a consistent stroke icon reads as designed.
 */

const PATHS: Record<string, string> = {
  assignment: 'M7 3.5h7L18.5 8v12a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM14 3.5V8h4.5M9 12h6m-6 3.5h6',
  test: 'M8 3.5h8a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM10 8h4m-4 4h4m-4 4h2',
  project: 'M4 7.5A1.5 1.5 0 0 1 5.5 6h4l1.5 2h7.5A1.5 1.5 0 0 1 20 9.5v8A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z',
  presentation: 'M4 4.5h16M5.5 4.5h13v9.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1zM12 15v2.5m-3.5 3 3.5-3 3.5 3',
};

export default function TypeIcon({ type, className = 'size-4' }: { type?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path d={PATHS[type || 'assignment'] || PATHS.assignment} />
    </svg>
  );
}
