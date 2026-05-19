import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
} from "react";
import { authApi } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("handleey_token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      const saved = localStorage.getItem("handleey_user");
      if (saved) {
        try {
          setUser(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse saved user:", e);
        }
      }
      authApi
        .me()
        .then(({ data }) => {
          setUser(data);
          localStorage.setItem("handleey_user", JSON.stringify(data));
        })
        .catch(() => {
          setToken(null);
          setUser(null);
          localStorage.removeItem("handleey_token");
          localStorage.removeItem("handleey_user");
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = (tokenValue, userData) => {
    setToken(tokenValue);
    setUser(userData);
    localStorage.setItem("handleey_token", tokenValue);
    localStorage.setItem("handleey_user", JSON.stringify(userData));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("handleey_token");
    localStorage.removeItem("handleey_user");
  };

  // Memoise so consumers don't re-render on every Provider render.
  const value = useMemo(
    () => ({ user, token, login, logout, loading, isAuthenticated: !!token }),
    [user, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
