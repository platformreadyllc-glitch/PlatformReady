import { Moon, Sun } from 'lucide-react'
import { BrowserRouter, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { useTheme } from '@/hooks/useTheme'
import MeetSetup from '@/pages/MeetSetup'

function Layout() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="flex h-screen bg-background">
      <nav className="w-56 shrink-0 bg-surface border-r border-border flex flex-col gap-1 p-4">
        <span className="text-lg font-semibold text-primary mb-4">PlatformReady</span>
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-slate-700 text-primary'
                : 'text-secondary hover:bg-slate-700/50 hover:text-primary'
            }`
          }
        >
          Meet Setup
        </NavLink>
        <NavLink
          to="/platform/1"
          className={({ isActive }) =>
            `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-slate-700 text-primary'
                : 'text-secondary hover:bg-slate-700/50 hover:text-primary'
            }`
          }
        >
          Platform View
        </NavLink>
        <NavLink
          to="/controls"
          className={({ isActive }) =>
            `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-slate-700 text-primary'
                : 'text-secondary hover:bg-slate-700/50 hover:text-primary'
            }`
          }
        >
          Controls
        </NavLink>
        <button
          onClick={toggleTheme}
          className="mt-auto flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-secondary hover:bg-slate-700/50 hover:text-primary transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
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
