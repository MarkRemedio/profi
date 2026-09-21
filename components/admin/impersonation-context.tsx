"use client";

import { createContext, useContext, useState, useCallback } from "react";

export interface ImpersonatedClient {
  id: string;
  name: string;
  email: string;
  plan: string;
  initials: string;
}

interface ImpersonationContextValue {
  impersonating: ImpersonatedClient | null;
  startImpersonation: (client: ImpersonatedClient) => void;
  stopImpersonation: () => void;
  isImpersonating: boolean;
}

const ImpersonationContext = createContext<ImpersonationContextValue>({
  impersonating: null,
  startImpersonation: () => {},
  stopImpersonation: () => {},
  isImpersonating: false,
});

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const [impersonating, setImpersonating] = useState<ImpersonatedClient | null>(null);

  const startImpersonation = useCallback((client: ImpersonatedClient) => {
    setImpersonating(client);
  }, []);

  const stopImpersonation = useCallback(() => {
    setImpersonating(null);
  }, []);

  return (
    <ImpersonationContext.Provider
      value={{
        impersonating,
        startImpersonation,
        stopImpersonation,
        isImpersonating: impersonating !== null,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  return useContext(ImpersonationContext);
}
