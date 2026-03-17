import { useEffect } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";

import { getCurrentUser } from "@/api/auth";
import { router } from "@/app/router";
import { useAuthStore } from "@/store/auth";

const queryClient = new QueryClient();

function AuthBootstrap() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const setLoading = useAuthStore((state) => state.setLoading);
  const setUser = useAuthStore((state) => state.setUser);
  const markAnonymous = useAuthStore((state) => state.markAnonymous);

  useEffect(() => {
    if (!token) {
      if (status !== "anonymous" || user) {
        markAnonymous();
      }
      return;
    }

    if (status === "authenticated" && user) {
      return;
    }

    let isActive = true;
    setLoading();

    getCurrentUser(token)
      .then((currentUser) => {
        if (isActive) {
          setUser(currentUser);
        }
      })
      .catch(() => {
        if (isActive) {
          markAnonymous();
        }
      });

    return () => {
      isActive = false;
    };
  }, [markAnonymous, setLoading, setUser, status, token, user]);

  return <RouterProvider router={router} />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap />
    </QueryClientProvider>
  );
}
