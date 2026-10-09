import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from './api.js'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hostels, setHostels] = useState([])

  useEffect(() => {
    api('/api/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null)).finally(() => setLoading(false))
    api('/api/hostels').then((d) => setHostels(d.hostels)).catch(() => {})
  }, [])

  const login = useCallback(async (email, password) => {
    const d = await api('/api/auth/login', { method: 'POST', body: { email, password } })
    setUser(d.user)
    return d.user
  }, [])
  const register = useCallback(async (payload) => {
    const d = await api('/api/auth/register', { method: 'POST', body: payload })
    setUser(d.user)
    return d.user
  }, [])
  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }, [])

  const hostelName = useCallback((slug) => hostels.find((h) => h.slug === slug)?.name || slug?.toUpperCase(), [hostels])

  return (
    <AuthCtx.Provider value={{ user, loading, hostels, hostelName, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
