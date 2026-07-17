import { useLocation } from 'react-router-dom'

const DEMO_PREFIX = '/demo'

/**
 * Shared pages (Login, Signup, Dashboard) are mounted both unwrapped
 * (e.g. /dashboard) and nested under the phone-frame demo (e.g.
 * /demo/dashboard). Internal links/navigation need to stay under
 * whichever prefix is currently active rather than hardcoding either one.
 */
export function useRoutePrefix(): string {
  const { pathname } = useLocation()
  return pathname.startsWith(DEMO_PREFIX) ? DEMO_PREFIX : ''
}
