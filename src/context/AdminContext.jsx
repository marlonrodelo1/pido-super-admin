import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AdminContext = createContext()

// Quién entra en la consola. 'comercial' (28 oct 2026): Edinson, solo
// Establecimientos y sin dinero, pedidos ni clientes (ver Sidebar.jsx).
const ROLES_CONSOLA = ['superadmin', 'comercial']

export function AdminProvider({ children }) {
  const [user, setUser] = useState(null)
  const [rol, setRol] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

  async function verificarRol(session) {
    if (!session?.user) {
      setUser(null)
      setRol(null)
      setAccessDenied(false)
      return
    }

    // Siempre desde `usuarios.rol`. Antes se miraba primero `user_metadata.rol`
    // del JWT, y ese lo puede cambiar el propio usuario con auth.updateUser: no
    // sirve para decidir qué pantallas ve, y menos ahora que hay dos roles.
    const { data, error } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', session.user.id)
      .maybeSingle()

    // Un fallo de red al refrescar el token no debe echar a nadie: se deja como estaba.
    if (error) return

    if (ROLES_CONSOLA.includes(data?.rol)) {
      setUser(session.user)
      setRol(data.rol)
      setAccessDenied(false)
    } else {
      await supabase.auth.signOut()
      setUser(null)
      setRol(null)
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
        setRol(null)
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
    setRol(null)
    setAccessDenied(false)
  }

  return (
    <AdminContext.Provider value={{ user, rol, loading, login, logout, accessDenied }}>
      {children}
    </AdminContext.Provider>
  )
}

export function useAdmin() {
  return useContext(AdminContext)
}
