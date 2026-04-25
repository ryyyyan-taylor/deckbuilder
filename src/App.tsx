import { BrowserRouter, Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthContext, useAuthProvider } from './hooks/useAuth'
import { AuthForm } from './components/auth/AuthForm'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { ErrorBoundary } from './components/ErrorBoundary'
import { NavLayout } from './components/layout/NavLayout'
import { PublicDecksPage } from './components/deck/PublicDecksPage'
import { DeckList } from './components/deck/DeckList'
import { DeckForm } from './components/deck/DeckForm'
import { EditDeckPage } from './components/deck/EditDeckPage'
import { ViewDeckPage } from './components/deck/ViewDeckPage'
import { ComparePage } from './components/deck/ComparePage'
import { SandboxPage } from './components/deck/SandboxPage'
import { UtilitiesPage } from './components/deck/UtilitiesPage'
import { useDeck } from './hooks/useDeck'
import type { DeckInput } from './hooks/useDeck'
import type { Game } from './lib/games'
import { useAuth } from './hooks/useAuth'

function NewDeckPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const gameParam = searchParams.get('game') as Game | null
  const game: Game = gameParam === 'swu' ? 'swu' : 'mtg'
  const { createDeck, error } = useDeck()

  const handleSubmit = async (data: DeckInput) => {
    const result = await createDeck(data)
    if (!result) throw new Error(error ?? 'Failed to create deck')
    navigate('/decks?game=' + game)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="w-full max-w-md px-4">
        <h1 className="text-2xl font-bold text-center mb-6">New Deck</h1>
        <DeckForm game={game} onSubmit={handleSubmit} onCancel={() => navigate('/decks?game=' + game)} />
      </div>
    </div>
  )
}

function AuthRedirect({ mode }: { mode: 'login' | 'signup' }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (user) return <Navigate to="/" replace />
  return <AuthForm mode={mode} />
}

function App() {
  const auth = useAuthProvider()

  return (
    <ErrorBoundary>
      <AuthContext.Provider value={auth}>
        <BrowserRouter>
          <Routes>
          {/* Public deck view — no nav chrome */}
          <Route path="/deck/:id" element={<ViewDeckPage />} />

          {/* Auth pages — redirect to / if already logged in */}
          <Route path="/login" element={<AuthRedirect mode="login" />} />
          <Route path="/signup" element={<AuthRedirect mode="signup" />} />

          {/* Deck editor — no nav chrome */}
          <Route element={<ProtectedRoute />}>
            <Route path="/decks/new" element={<NewDeckPage />} />
            <Route path="/decks/:id/edit" element={<EditDeckPage />} />
          </Route>

          {/* Main nav layout */}
          <Route element={<NavLayout />}>
            <Route path="/" element={<PublicDecksPage />} />
            <Route path="/utilities" element={<UtilitiesPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/sandbox" element={<SandboxPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/decks" element={<DeckList />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BrowserRouter>
      </AuthContext.Provider>
    </ErrorBoundary>
  )
}

export default App
