import { Monitor, Moon, Sun } from 'lucide-react'
import { BrowserRouter, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { useTheme, THEMES, type Theme } from '@/hooks/useTheme'
import MeetSetup from '@/pages/MeetSetup'

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

function Layout() {
  const { theme, cycleTheme } = useTheme()

  return (
    <div className="flex h-screen bg-background">
      <nav className="w-56 shrink-0 bg-surface border-r border-border flex flex-col gap-1 p-4">
        <span className="text-lg font-semibold text-primary mb-4">Platform Ready</span>
        <NavLink to="/" end className={navLinkClass}>
          Meet Setup
        </NavLink>
        <NavLink to="/platform/1" className={navLinkClass}>
          Platform View
        </NavLink>
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
          <Route path="/platform/:id" element={<Placeholder name="Platform View" />} />
          <Route path="/controls" element={<Placeholder name="Controls" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
