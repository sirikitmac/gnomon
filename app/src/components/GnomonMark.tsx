import mark from '../assets/gnomon-mark.svg?raw'

/**
 * The Gnomon blade mark (traced from the team's logo). The ink follows the surrounding text color,
 * so it works on light and dark backgrounds; the L1 dot stays orange.
 */
export default function GnomonMark({ height = 22, className = '', title }: { height?: number; className?: string; title?: string }) {
  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`inline-block shrink-0 [&>svg]:h-full [&>svg]:w-auto ${className}`}
      style={{ height }}
      dangerouslySetInnerHTML={{ __html: mark }}
    />
  )
}
