import { useCallback, useEffect, useState } from 'react'
import Dashboard from './Dashboard'
import Landing from './Landing'

function isDashboardRoute(pathname: string): boolean {
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/')
}

export default function App() {
  const [pathname, setPathname] = useState(() => {
    // Preserve compatibility with pre-dashboard shared links (?site=...) opened at root.
    if (location.pathname === '/' && new URLSearchParams(location.search).has('site')) {
      const next = `/dashboard${location.search}${location.hash}`
      history.replaceState(history.state, '', next)
      return '/dashboard'
    }
    return location.pathname
  })

  useEffect(() => {
    const onPopState = () => setPathname(location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((to: string) => {
    if (location.pathname === to) return
    history.pushState(null, '', to)
    setPathname(to)
    window.scrollTo({ top: 0 })
  }, [])

  if (isDashboardRoute(pathname)) {
    return <Dashboard onNavigateHome={() => navigate('/')} />
  }

  return <Landing onOpenDashboard={() => navigate('/dashboard')} />
}
