import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export const ROLE_LABELS = {
  kitchen_staff: "Kitchen Staff",
  operations_staff: "Operations Staff",
  operations_supervisor: "Operations Supervisor",
  maintenance_technician: "Maintenance Technician",
  maintenance_supervisor: "Maintenance Supervisor",
  admin: "Admin",
};

export const ROLE_HOME = {
  kitchen_staff: "/kitchen/dashboard",
  operations_staff: "/operations/dashboard",
  operations_supervisor: "/supervisor/dashboard",
  maintenance_technician: "/technician/dashboard",
  maintenance_supervisor: "/maintenance-supervisor/dashboard",
  admin: "/admin/dashboard",
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = checking, null = not authed
  const [error, setError] = useState(null);

  const loadMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (e) {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = async (username, password) => {
    setError(null);
    try {
      const { data } = await api.post("/auth/login", { username, password });
      localStorage.setItem("hulk_token", data.token);
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (e) {
      const msg = formatApiError(e);
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      // ignore
    }
    localStorage.removeItem("hulk_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, error, setError, refresh: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
