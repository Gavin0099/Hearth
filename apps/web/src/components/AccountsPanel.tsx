import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountRecord } from "@hearth/shared";
import { fetchAccounts } from "../lib/accounts";

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "success"; items: AccountRecord[] };

type AccountsPanelProps = {
  session: Session | null;
};

export function AccountsPanel({ session }: AccountsPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    if (!session) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      const result = await fetchAccounts();
      if (cancelled) {
        return;
      }

      if (result.status === "error") {
        setState({ status: "error", message: result.error });
        return;
      }

      setState({ status: "success", items: result.items });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <article className="panel">
      <h2>帳戶狀態</h2>
      {!session ? <p>登入後會自動讀取目前使用者的帳戶資料。</p> : null}
      {state.status === "loading" || state.status === "idle" ? (
        session ? <p>正在向 Cloudflare Worker 讀取 Supabase 帳戶資料...</p> : null
      ) : null}
      {state.status === "error" ? (
        <p>
          尚未載入帳戶資料: {state.message}
          <br />
          先用 Supabase 登入取得 session，Worker 才能辨識目前使用者。
        </p>
      ) : null}
      {state.status === "success" ? (
        state.items.length > 0 ? (
          <ul>
            {state.items.map((item) => (
              <li key={item.id}>
                {item.name} / {item.type} / {item.currency}
              </li>
            ))}
          </ul>
        ) : (
          <p>目前沒有帳戶資料。下一步可以先建立第一個現金或投資帳戶。</p>
        )
      ) : null}
    </article>
  );
}
