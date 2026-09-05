import { useState, useCallback } from 'react';
import { login as loginRequest, logout as logoutRequest, getStoredUser, isLoggedIn } from '../services/authService';
import { api } from '../services/api.js';

const PERMISSIONS_KEY = 'luna_admin_permissions';

function getStoredPermissions() {
  try {
    return JSON.parse(localStorage.getItem(PERMISSIONS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function useAuth() {
  const [user, setUser] = useState(getStoredUser());
  const [authed, setAuthed] = useState(isLoggedIn());
  const [permissions, setPermissions] = useState(getStoredPermissions());

  const login = useCallback(async (email, password) => {
    const data = await loginRequest(email, password);
    setUser(data.user);
    setAuthed(true);
    // Real permission list from the DB (section 16) — drives which admin
    // nav links/buttons render. The backend re-checks every action
    // regardless (requirePermission on every route), so this is UX only.
    try {
      const perms = await api.get('/auth/permissions');
      localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(perms));
      setPermissions(perms);
    } catch {
      setPermissions([]);
    }
    return data;
  }, []);

  const logout = useCallback(() => {
    logoutRequest();
    localStorage.removeItem(PERMISSIONS_KEY);
    setUser(null);
    setAuthed(false);
    setPermissions([]);
  }, []);

  const can = useCallback((permissionKey) => permissions.includes(permissionKey), [permissions]);

  return { user, authed, permissions, can, login, logout };
}
