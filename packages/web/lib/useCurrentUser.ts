"use client";

import { useQuery } from "@tanstack/react-query";
import type { UserPublic } from "@gihtcx/shared";
import { api, ApiError } from "./apiClient";

export function useCurrentUser() {
  return useQuery<UserPublic | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.get<UserPublic>("/auth/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
  });
}
