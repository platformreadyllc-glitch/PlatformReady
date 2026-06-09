import { BrowserRouter, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import MeetSetup from '@/pages/MeetSetup'

function Layout() {
  return (
    <div className="flex h-screen bg-gray-50">
      <nav className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col gap-1 p-4">
        <span className="text-lg font-semibold text-gray-900 mb-4">PlatformReady</span>
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
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
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
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
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`
          }
        >
          Controls
        </NavLink>
      </nav>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="text-gray-500 text-sm">
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
