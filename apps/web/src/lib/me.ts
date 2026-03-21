import { apiFetch } from "./api";

export type AuthMeResponse =
  | {
      user: {
        id: string;
        email: string | null;
      };
      status: "ok";
    }
  | {
      error: string;
      status: "error";
    };

export async function fetchAuthMe() {
  const response = await apiFetch("/api/auth/me");
  return (await response.json()) as AuthMeResponse;
}
