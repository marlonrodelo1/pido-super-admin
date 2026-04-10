import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AdminContext = createContext()

export function AdminProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

  async function verificarRol(session) {
    if (!session?.user) {
      setUser(null)
      setAccessDenied(false)
      return
    }
    const { data } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', session.user.id)
      .single()

    if (data?.rol === 'superadmin') {
      setUser(session.user)
      setAccessDenied(false)
    } else {
      await supabase.auth.signOut()
      setUser(null)
      setAccessDenied(true)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      verificarRol(session).finally(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'SIGNED_OUT') {
        setUser(null)
        return
      }
      verificarRol(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function login(email, password) {
    setAccessDenied(false)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error }
    const { data: { session } } = await supabase.auth.getSession()
    await verificarRol(session)
    if (!user && !error) {
      return { error: null }
    }
    return { error: null }
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
    setAccessDenied(false)
  }

  return (
    <AdminContext.Provider value={{ user, loading, login, logout, accessDenied }}>
      {children}
    </AdminContext.Provider>
  )
}

export function useAdmin() {
  return useContext(AdminContext)
}
