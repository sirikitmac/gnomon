export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Copy text to the clipboard, with a fallback for browsers/contexts without the async API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { ok = false }
    ta.remove()
    return ok
  }
}

/** Scroll a panel into view (its scroll-margin keeps it below the sticky app bar). */
export function scrollToId(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }))
}
