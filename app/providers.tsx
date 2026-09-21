"use client";

import { isServer, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GSAPScrollProvider } from "../components/providers/gsap-scroll";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 60_000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }

  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }

  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <GSAPScrollProvider>
        {children}
      </GSAPScrollProvider>
    </QueryClientProvider>
  );
}