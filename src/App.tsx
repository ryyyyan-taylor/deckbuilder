import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthContext, useAuthProvider } from './hooks/useAuth'
import { AuthForm } from './components/auth/AuthForm'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { DeckList } from './components/deck/DeckList'
import { DeckForm } from './components/deck/DeckForm'
import { EditDeckPage } from './components/deck/EditDeckPage'
import { useDeck } from './hooks/useDeck'
import type { DeckInput } from './hooks/useDeck'

function NewDeckPage() {
  const navigate = useNavigate()
  const { createDeck, error } = useDeck()

  const handleSubmit = async (data: DeckInput) => {
    const result = await createDeck(data)
    if (!result) throw new Error(error ?? 'Failed to create deck')
    navigate('/decks')
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="w-full max-w-md px-4">
        <h1 className="text-2xl font-bold text-center mb-6">New Deck</h1>
        <DeckForm onSubmit={handleSubmit} onCancel={() => navigate('/decks')} />
      </div>
    </div>
  )
}

function App() {
  const auth = useAuthProvider()

  return (
    <AuthContext.Provider value={auth}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthForm mode="login" />} />
          <Route path="/signup" element={<AuthForm mode="signup" />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/decks" element={<DeckList />} />
            <Route path="/decks/new" element={<NewDeckPage />} />
            <Route path="/decks/:id/edit" element={<EditDeckPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/decks" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}

export default App
