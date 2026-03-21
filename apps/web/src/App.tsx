import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { transactionCategories } from "@hearth/shared";
import { env } from "./env";
import { AccountsPanel } from "./components/AccountsPanel";
import { AuthPanel } from "./components/AuthPanel";
import { ImportPanel } from "./components/ImportPanel";
import { MonthlyReportPanel } from "./components/MonthlyReportPanel";
import { RecurringTemplatesPanel } from "./components/RecurringTemplatesPanel";
import { TransactionsPanel } from "./components/TransactionsPanel";
import { getCurrentSession, signInWithGoogle, signOut } from "./lib/auth";
import { getSupabaseBrowserClient } from "./lib/supabase";

const dashboardCards = [
  {
    label: "本月支出",
    value: "NT$ 0",
    detail: "等待銀行 CSV / Excel 帳本匯入",
  },
  {
    label: "投資市值",
    value: "NT$ 0",
    detail: "等待永豐台股對帳單與報價資料",
  },
  {
    label: "總淨值",
    value: "NT$ 0",
    detail: "現金 + 投資資產合併顯示",
  },
];

const importTracks = [
  "永豐銀行 / 信用卡 CSV",
  "月帳本 Excel",
  "永豐台股對帳單 CSV",
  "手動支出與週期支出",
];

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [reportRefreshKey, setReportRefreshKey] = useState(0);
  const [recurringRefreshKey, setRecurringRefreshKey] = useState(0);
  const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setAuthLoading(false);
      return;
    }

    let isMounted = true;

    void getCurrentSession()
      .then((currentSession) => {
        if (!isMounted) {
          return;
        }
        setSession(currentSession);
        setAuthLoading(false);
      })
      .catch((error: Error) => {
        if (!isMounted) {
          return;
        }
        setAuthError(error.message);
        setAuthLoading(false);
      });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }
      setSession(nextSession);
      setAuthError(null);
      setAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignIn() {
    try {
      setAuthError(null);
      await signInWithGoogle();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to start sign-in.");
    }
  }

  function handleTransactionCreated() {
    setReportRefreshKey((current) => current + 1);
  }

  function handleImported() {
    setReportRefreshKey((current) => current + 1);
  }

  function handleRecurringTemplatesCreated() {
    setRecurringRefreshKey((current) => current + 1);
  }

  function handleRecurringTemplatesApplied() {
    setReportRefreshKey((current) => current + 1);
  }

  async function handleSignOut() {
    try {
      setAuthError(null);
      await signOut();
      setSession(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign out.");
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Hearth</p>
          <h1>家庭資產與現金流總覽</h1>
          <p className="summary">
            這個第一版骨架先把月報、資產淨值、資料匯入三條主線定下來，
            後續再接 Supabase、Parser、排程與 OAuth。
          </p>
        </div>
        <div className="hero-panel">
          <p>當前實作切片</p>
          <ul>
            <li>Cloudflare Pages frontend</li>
            <li>Cloudflare Workers API</li>
            <li>Supabase schema and client baseline</li>
          </ul>
        </div>
      </section>

      <section className="card-grid">
        {dashboardCards.map((card) => (
          <article key={card.label} className="metric-card">
            <p>{card.label}</p>
            <strong>{card.value}</strong>
            <span>{card.detail}</span>
          </article>
        ))}
      </section>

      <section className="two-column">
        <article className="panel">
          <h2>部署架構</h2>
          <ul>
            <li>Web: {env.webRuntime}</li>
            <li>API: {env.apiBaseUrl}</li>
            <li>Data: Supabase</li>
          </ul>
        </article>
        <article className="panel">
          <h2>第一條 Live API</h2>
          <ul>
            <li>GET {env.apiBaseUrl}/api/accounts</li>
            <li>POST {env.apiBaseUrl}/api/accounts</li>
            <li>需帶 Supabase session bearer token</li>
          </ul>
        </article>
        <AuthPanel
          error={authError}
          isConfigured={isSupabaseConfigured}
          isLoading={authLoading}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          session={session}
        />
        <MonthlyReportPanel refreshKey={reportRefreshKey} session={session} />
        <ImportPanel
          onImported={handleImported}
          onRecurringTemplatesCreated={handleRecurringTemplatesCreated}
          session={session}
        />
        <RecurringTemplatesPanel
          onTemplatesApplied={handleRecurringTemplatesApplied}
          refreshKey={recurringRefreshKey}
          session={session}
        />
        <TransactionsPanel
          onTransactionCreated={handleTransactionCreated}
          refreshKey={reportRefreshKey}
          session={session}
        />
        <AccountsPanel session={session} />
        <article className="panel">
          <h2>資料匯入管線</h2>
          <ul>
            {importTracks.map((track) => (
              <li key={track}>{track}</li>
            ))}
          </ul>
        </article>
        <article className="panel">
          <h2>初始支出分類</h2>
          <div className="category-list">
            {transactionCategories.map((category) => (
              <span key={category.id} className="category-chip">
                {category.label}
              </span>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
