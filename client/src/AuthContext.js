import { createContext, useContext } from 'react';

// { plan: 'free'|'pro', billingEnabled, user, verified }
export const AuthContext = createContext({ plan: 'pro', billingEnabled: false, user: null });
export const useAuth = () => useContext(AuthContext);

// True when this feature should be locked behind Pro for the current user.
export const useLocked = () => {
  const { plan, billingEnabled } = useAuth();
  return billingEnabled && plan !== 'pro';
};
