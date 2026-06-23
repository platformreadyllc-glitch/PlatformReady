import { useMemo } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { BrowserRouter, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useTheme, THEMES, type Theme } from '@/hooks/useTheme'
import MeetSetup from '@/pages/MeetSetup'
import PlatformView from '@/pages/PlatformView'
import ScoreTableView from '@/pages/ScoreTableView'

const THEME_META: Record<Theme, { icon: React.ReactNode; label: string }> = {
  midnight: { icon: <Moon size={16} />, label: 'Midnight' },
  studio: { icon: <Monitor size={16} />, label: 'Studio' },
  light: { icon: <Sun size={16} />, label: 'Light' },
}

function nextTheme(t: Theme): Theme {
  return THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-nav-active text-primary' : 'text-secondary hover:bg-nav-hover hover:text-primary'
  }`

const indentedNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `pl-6 pr-3 py-1.5 rounded-md text-sm transition-colors ${
    isActive ? 'bg-nav-active text-primary' : 'text-secondary hover:bg-nav-hover hover:text-primary'
  }`

function readActivePlatforms(): Array<{ name: string }> {
  try {
    const raw = localStorage.getItem('platformready_meet')
    if (!raw) return []
    const config = JSON.parse(raw)
    const platforms: Array<{ name: string; active: boolean }> = config.days?.[0]?.platforms ?? []
    return platforms.filter((p) => p.active)
  } catch {
    return []
  }
}

function Layout() {
  const { theme, cycleTheme } = useTheme()
  const location = useLocation()

  // Re-read platforms whenever navigation occurs so the nav stays in sync
  // after the user saves a new config on MeetSetup.
  const activePlatforms = useMemo(readActivePlatforms, [location])

  return (
    <div className="flex h-screen bg-background">
      <nav className="w-56 shrink-0 bg-surface border-r border-border flex flex-col gap-1 p-4">
        <span className="text-lg font-semibold text-primary mb-4">Platform Ready</span>
        <NavLink to="/" end className={navLinkClass}>
          Meet Setup
        </NavLink>

        {activePlatforms.length > 0 ? (
          activePlatforms.map((p, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <span className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-widest text-secondary">
                {p.name || `Platform ${i + 1}`}
              </span>
              <NavLink to={`/platform/${i + 1}`} className={indentedNavLinkClass}>
                Platform Display
              </NavLink>
              <NavLink to={`/platform/${i + 1}/scoring`} className={indentedNavLinkClass}>
                Scoring Table
              </NavLink>
            </div>
          ))
        ) : (
          <NavLink to="/platform/1" className={navLinkClass}>
            Platform View
          </NavLink>
        )}

        <NavLink to="/controls" className={navLinkClass}>
          Controls
        </NavLink>
        <button
          onClick={cycleTheme}
          className="mt-auto flex items-center justify-center w-9 h-9 rounded-md text-secondary hover:bg-nav-hover hover:text-primary transition-colors"
          aria-label={`Switch to ${THEME_META[nextTheme(theme)].label} theme`}
          title={`Switch to ${THEME_META[nextTheme(theme)].label} theme`}
        >
          {THEME_META[nextTheme(theme)].icon}
        </button>
      </nav>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="text-secondary text-sm">
      {name} — coming soon
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<MeetSetup />} />
          <Route path="/controls" element={<Placeholder name="Controls" />} />
        </Route>
        {/* Platform pages render without the sidebar — full-screen display for TVs */}
        <Route path="/platform/:id" element={<PlatformView />} />
        <Route path="/platform/:id/scoring" element={<ScoreTableView />} />
      </Routes>
    </BrowserRouter>
  )
}
