import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { env } from "./env";
import { AccountsPanel } from "./components/AccountsPanel";
import { AuthPanel } from "./components/AuthPanel";
import { BankLedgerPanel } from "./components/BankLedgerPanel";
import { CreditCardLedgerPanel } from "./components/CreditCardLedgerPanel";
import { GmailSyncPanel } from "./components/GmailSyncPanel";
import { ImportPanel } from "./components/ImportPanel";
import { InsurancePanel } from "./components/InsurancePanel";
import { LoanPanel } from "./components/LoanPanel";
import { MonthlyReportPanel } from "./components/MonthlyReportPanel";
import { PortfolioPanel } from "./components/PortfolioPanel";
import { RecurringTemplatesPanel } from "./components/RecurringTemplatesPanel";
import { OpsPanel } from "./components/OpsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { TransactionsPanel } from "./components/TransactionsPanel";
import { getCurrentSession, signInWithGoogle, signOut } from "./lib/auth";
import { getSupabaseBrowserClient } from "./lib/supabase";

type AppView = "home" | "ledger" | "bank" | "loan" | "insurance" | "settings";

const buildCommit = __APP_COMMIT__;
const buildTime = __APP_BUILD_TIME__;
const buildTimeLabel = Number.isNaN(Date.parse(buildTime))
  ? buildTime
  : new Date(buildTime).toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [reportRefreshKey, setReportRefreshKey] = useState(0);
  const [recurringRefreshKey, setRecurringRefreshKey] = useState(0);
  const [currentView, setCurrentView] = useState<AppView>("home");
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
          <div className="build-badge" title={`Build ${buildCommit} @ ${buildTime}`}>
            <span>Build {buildCommit}</span>
            <span>{buildTimeLabel}</span>
          </div>
          <p>家庭資產與現金流總覽</p>
        </div>
        <nav className="app-nav">
          <button
            className={`app-nav-tab${currentView === "home" ? " active" : ""}`}
            onClick={() => setCurrentView("home")}
            type="button"
          >
            總覽
          </button>
          <button
            className={`app-nav-tab${currentView === "ledger" ? " active" : ""}`}
            onClick={() => setCurrentView("ledger")}
            type="button"
          >
            信用卡明細
          </button>
          <button
            className={`app-nav-tab${currentView === "bank" ? " active" : ""}`}
            onClick={() => setCurrentView("bank")}
            type="button"
          >
            銀行明細
          </button>
          <button
            className={`app-nav-tab${currentView === "loan" ? " active" : ""}`}
            onClick={() => setCurrentView("loan")}
            type="button"
          >
            貸款
          </button>
          <button
            className={`app-nav-tab${currentView === "insurance" ? " active" : ""}`}
            onClick={() => setCurrentView("insurance")}
            type="button"
          >
            保險
          </button>
          <button
            className={`app-nav-tab${currentView === "settings" ? " active" : ""}`}
            onClick={() => setCurrentView("settings")}
            type="button"
          >
            設定
          </button>
        </nav>
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

      {currentView === "home" && (
        <section className="two-column">
          <MonthlyReportPanel refreshKey={reportRefreshKey} session={session} />
          <PortfolioPanel refreshKey={reportRefreshKey} session={session} />
          <GmailSyncPanel session={session} onImported={handleImported} />
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
      )}

      {currentView === "ledger" && (
        <section className="two-column">
          <CreditCardLedgerPanel session={session} />
        </section>
      )}

      {currentView === "bank" && (
        <section className="two-column">
          <BankLedgerPanel session={session} />
        </section>
      )}

      {currentView === "loan" && (
        <section className="two-column">
          <LoanPanel session={session} />
        </section>
      )}

      {currentView === "insurance" && (
        <section className="two-column">
          <InsurancePanel session={session} />
        </section>
      )}

      {currentView === "settings" && (
        <section className="two-column">
          <SettingsPanel session={session} />
          <OpsPanel session={session} />
        </section>
      )}
    </main>
  );
}
