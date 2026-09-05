import { useState, useCallback } from 'react';
import {
  register as registerRequest, login as loginRequest, logout as logoutRequest,
  getStoredCustomer, isCustomerLoggedIn,
} from '../services/customerAuthService.js';

export function useCustomerAuth() {
  const [customer, setCustomer] = useState(getStoredCustomer());
  const [authed, setAuthed] = useState(isCustomerLoggedIn());

  const login = useCallback(async (payload) => {
    const data = await loginRequest(payload);
    setCustomer(data.customer);
    setAuthed(true);
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await registerRequest(payload);
    setCustomer(data.customer);
    setAuthed(true);
    return data;
  }, []);

  const logout = useCallback(() => {
    logoutRequest();
    setCustomer(null);
    setAuthed(false);
  }, []);

  return { customer, authed, login, register, logout, setCustomer };
}
