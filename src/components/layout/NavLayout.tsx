import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export function NavLayout() {
  const { user, signOut } = useAuth()
  const { pathname } = useLocation()

  const isActive = (path: string) => pathname === path || (path === '/decks' && pathname.startsWith('/decks'))

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <nav className="border-b border-gray-700 bg-gray-900 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-12">
          <div className="flex gap-1">
            <Link
              to="/"
              className={`px-4 py-2 font-medium text-sm border-b-2 ${
                isActive('/')
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              Public Decks
            </Link>

            {user ? (
              <Link
                to="/decks"
                className={`px-4 py-2 font-medium text-sm border-b-2 ${
                  isActive('/decks')
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                My Decks
              </Link>
            ) : (
              <span
                className="px-4 py-2 font-medium text-sm border-b-2 border-transparent text-gray-600 cursor-not-allowed"
                title="Log in to view your decks"
              >
                My Decks
              </span>
            )}

            <Link
              to="/utilities"
              className={`px-4 py-2 font-medium text-sm border-b-2 ${
                isActive('/utilities')
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              Utilities
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <button
                onClick={signOut}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium"
              >
                Log Out
              </button>
            ) : (
              <Link
                to="/login"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium"
              >
                Log In
              </Link>
            )}
          </div>
        </div>
      </nav>

      <Outlet />
    </div>
  )
}
