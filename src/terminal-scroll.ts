const BOTTOM_TOLERANCE = 24

export type TerminalScrollController = {
  isFollowing: () => boolean
  followOutput: () => void
  jumpToBottom: () => void
  destroy: () => void
}

/** Keep scroll intent independent of transient scrollHeight/layout changes. */
export function createTerminalScrollController(
  viewport: HTMLElement,
  content: HTMLElement,
  options: { autoScrollEnabled: () => boolean; onBottom: () => void },
): TerminalScrollController {
  let following = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= BOTTOM_TOLERANCE
  let previousTop = viewport.scrollTop
  let frame: number | null = null

  function snapToBottom() {
    viewport.scrollTop = viewport.scrollHeight
    previousTop = viewport.scrollTop
    options.onBottom()
  }

  function isFollowing() {
    return following && options.autoScrollEnabled()
  }

  function followOutput() {
    if (!isFollowing()) return
    snapToBottom()
    // Font loading, wrapping and sibling panels can settle after React's commit.
    if (frame === null) {
      frame = requestAnimationFrame(() => {
        frame = null
        if (isFollowing()) snapToBottom()
      })
    }
  }

  function handleScroll() {
    const atBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= BOTTOM_TOLERANCE
    if (atBottom) {
      following = true
      options.onBottom()
    } else if (viewport.scrollTop < previousTop) {
      // Moving upward pauses following. Merely growing the content or shrinking
      // the viewport must not be mistaken for a player scrolling into history.
      following = false
    }
    previousTop = viewport.scrollTop
  }

  viewport.addEventListener('scroll', handleScroll)
  const observer = new ResizeObserver(followOutput)
  observer.observe(viewport)
  observer.observe(content)
  followOutput()

  return {
    isFollowing,
    followOutput,
    jumpToBottom() {
      following = true
      snapToBottom() // Manual jumping also works with auto-scroll disabled.
      followOutput()
    },
    destroy() {
      observer.disconnect()
      viewport.removeEventListener('scroll', handleScroll)
      if (frame !== null) cancelAnimationFrame(frame)
    },
  }
}
