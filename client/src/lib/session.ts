import { useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "./queryClient";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
};

export const SESSION_QUERY_KEY = ["session"] as const;

export function useSession() {
  return useQuery<SessionUser | null>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      try {
        const res = await apiRequest<{ user: SessionUser }>("GET", "/api/me");
        return res.user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
  });
}
