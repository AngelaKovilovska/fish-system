import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Проблем со врската при стартување (не е одјава) — се прикажува порака со „Обиди се повторно“
  const [connError, setConnError] = useState('');

  const loadUser = async () => {
    setLoading(true); setConnError('');
    // Само 401 значи „не си најавен“. Привремена грешка (нема интернет, серверот се рестартира)
    // не смее да го исфрли корисникот на екранот за најава — се пробува повторно.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const data = await api.me();
        setUser(data.user); setLoading(false);
        return;
      } catch (err) {
        if (err.status === 401) { setUser(null); setLoading(false); return; }
        if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
        else setConnError(err.message || 'Нема врска со серверот');
      }
    }
    setLoading(false);
  };

  useEffect(() => { loadUser(); }, []);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, connError, retry: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
