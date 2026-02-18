// React context and hooks for auth state management.
import { createContext, useContext, useEffect, useState } from "react";
import { getMe } from "../api/authApi";

// Create a context to share auth state and actions.
const AuthContext = createContext();

export function AuthProvider({ children }) {
  // Track the current user (null when logged out).
  const [user, setUser] = useState(null);

  const fetchUserProfile = async () => {
    try {
      const res = await getMe();
      setUser(res.data);
    } catch (err) {
      setUser(null);
    }
  };

  // Save token and user identifier after successful login.
  const login = (token, identifier) => {
    localStorage.setItem("token", token);
    setUser({ identifier });
    fetchUserProfile();
  };

  // Clear token and user state on logout.
  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  useEffect(() => {
    if (localStorage.getItem("token")) {
      fetchUserProfile();
    }
  }, []);

  return (
    // Expose auth state and actions to descendants.
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Convenience hook for consuming auth context.
export const useAuth = () => useContext(AuthContext);
