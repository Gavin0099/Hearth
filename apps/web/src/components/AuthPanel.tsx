import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { fetchAuthMe } from "../lib/me";

type AuthPanelProps = {
  isConfigured: boolean;
  isLoading: boolean;
  session: Session | null;
  error: string | null;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
};

type WorkerUserState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "success"; email: string | null; id: string };

export function AuthPanel({
  isConfigured,
  isLoading,
  session,
  error,
  onSignIn,
  onSignOut,
}: AuthPanelProps) {
  const user = session?.user ?? null;
  const [workerUser, setWorkerUser] = useState<WorkerUserState>({ status: "idle" });

  useEffect(() => {
    if (!session) {
      setWorkerUser({ status: "idle" });
      return;
    }

    let cancelled = false;

    async function loadWorkerUser() {
      setWorkerUser({ status: "loading" });
      try {
        const result = await fetchAuthMe();
        if (cancelled) {
          return;
        }

        if (result.status === "error") {
          setWorkerUser({ status: "error", message: result.error });
          return;
        }

        setWorkerUser({
          status: "success",
          email: result.user.email,
          id: result.user.id,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setWorkerUser({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    void loadWorkerUser();

    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <article className="panel">
      <h2>登入狀態</h2>
      {!isConfigured ? (
        <p>尚未設定 Supabase 前端環境變數，Auth UI 無法啟動。</p>
      ) : null}
      {isLoading ? <p>正在檢查目前 session...</p> : null}
      {error ? <p>Auth 錯誤: {error}</p> : null}
      {user ? (
        <>
          <p>目前登入者: {user.email ?? user.id}</p>
          {workerUser.status === "loading" ? <p>正在確認 Worker 端使用者狀態...</p> : null}
          {workerUser.status === "error" ? (
            <p>Worker 驗證失敗: {workerUser.message}</p>
          ) : null}
          {workerUser.status === "success" ? (
            <p>Worker 已辨識使用者: {workerUser.email ?? workerUser.id}</p>
          ) : null}
          <button className="action-button secondary" onClick={() => void onSignOut()}>
            Sign out
          </button>
        </>
      ) : (
        <>
          <p>目前尚未登入。請先用 Supabase Google Auth 建立 session。</p>
          <button
            className="action-button"
            disabled={!isConfigured}
            onClick={() => void onSignIn()}
          >
            Continue with Google
          </button>
        </>
      )}
    </article>
  );
}
