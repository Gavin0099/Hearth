import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { env } from "./env";
import { AccountsPanel } from "./components/AccountsPanel";
import { AuthPanel } from "./components/AuthPanel";
import { GmailSyncPanel } from "./components/GmailSyncPanel";
import { ImportPanel } from "./components/ImportPanel";
import { MonthlyReportPanel } from "./components/MonthlyReportPanel";
import { PortfolioPanel } from "./components/PortfolioPanel";
import { RecurringTemplatesPanel } from "./components/RecurringTemplatesPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { TransactionsPanel } from "./components/TransactionsPanel";
import { getCurrentSession, signInWithGoogle, signOut } from "./lib/auth";
import { getSupabaseBrowserClient } from "./lib/supabase";

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
        if (!isMounted) return;
        setSession(currentSession);
        setAuthLoading(false);
      })
      .catch((error: Error) => {
        if (!isMounted) return;
        setAuthError(error.message);
        setAuthLoading(false);
      });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
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
      setAuthError(error instanceof Error ? error.message : "登入失敗");
    }
  }

  async function handleSignOut() {
    try {
      setAuthError(null);
      await signOut();
      setSession(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "登出失敗");
    }
  }

  function handleTransactionCreated() { setReportRefreshKey((k) => k + 1); }
  function handleImported() { setReportRefreshKey((k) => k + 1); }
  function handleRecurringTemplatesCreated() { setRecurringRefreshKey((k) => k + 1); }
  function handleRecurringTemplatesApplied() { setReportRefreshKey((k) => k + 1); }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-header-title">
          <h1>Hearth</h1>
          <p>家庭資產與現金流總覽</p>
        </div>
        <AuthPanel
          error={authError}
          isConfigured={isSupabaseConfigured}
          isLoading={authLoading}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          session={session}
          compact
        />
      </header>

      <section className="two-column">
        <MonthlyReportPanel refreshKey={reportRefreshKey} session={session} />
        <PortfolioPanel refreshKey={reportRefreshKey} session={session} />
        <GmailSyncPanel session={session} onImported={handleImported} />
        <SettingsPanel session={session} />
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
      </section>
    </main>
  );
}
