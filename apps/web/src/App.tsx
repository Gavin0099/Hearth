import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { env } from "./env";
import { AuthPanel } from "./components/AuthPanel";
import { getCurrentSession, signInWithGoogle, signOut } from "./lib/auth";
import { apiFetch } from "./lib/api";
import { triggerGmailSyncNow } from "./lib/import-jobs";
import { getSupabaseBrowserClient } from "./lib/supabase";

const AccountsPanel = lazy(() =>
  import("./components/AccountsPanel").then((module) => ({ default: module.AccountsPanel })),
);
const BankLedgerPanel = lazy(() =>
  import("./components/BankLedgerPanel").then((module) => ({ default: module.BankLedgerPanel })),
);
const CreditCardLedgerPanel = lazy(() =>
  import("./components/CreditCardLedgerPanel").then((module) => ({ default: module.CreditCardLedgerPanel })),
);
const GmailSyncPanel = lazy(() =>
  import("./components/GmailSyncPanel").then((module) => ({ default: module.GmailSyncPanel })),
);
const ImportPanel = lazy(() =>
  import("./components/ImportPanel").then((module) => ({ default: module.ImportPanel })),
);
const InsurancePanel = lazy(() =>
  import("./components/InsurancePanel").then((module) => ({ default: module.InsurancePanel })),
);
const LoanPanel = lazy(() =>
  import("./components/LoanPanel").then((module) => ({ default: module.LoanPanel })),
);
const MonthlyReportPanel = lazy(() =>
  import("./components/MonthlyReportPanel").then((module) => ({ default: module.MonthlyReportPanel })),
);
const PortfolioPanel = lazy(() =>
  import("./components/PortfolioPanel").then((module) => ({ default: module.PortfolioPanel })),
);
const OpsPanel = lazy(() =>
  import("./components/OpsPanel").then((module) => ({ default: module.OpsPanel })),
);
const SettingsPanel = lazy(() =>
  import("./components/SettingsPanel").then((module) => ({ default: module.SettingsPanel })),
);

type AppView = "home" | "ledger" | "bank" | "loan" | "insurance" | "portfolio" | "settings";

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
  const [gmailRefreshKey, setGmailRefreshKey] = useState(0);
  const gmailAutoDetectSessionKey = useRef<string | null>(null);
  const [currentView, setCurrentView] = useState<AppView>("home");
  const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

  async function triggerGmailAutoDetect(sessionToSync: Session) {
    const sessionKey = `${sessionToSync.user.id}:${sessionToSync.access_token.slice(-12)}`;
    if (gmailAutoDetectSessionKey.current === sessionKey) return;
    gmailAutoDetectSessionKey.current = sessionKey;

    try {
      const result = await triggerGmailSyncNow();
      if (result.status === "error") {
        setAuthError(`Gmail 自動偵測失敗：${result.error}`);
        return;
      }
    } catch (error) {
      setAuthError(`Gmail 自動偵測失敗：${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    setGmailRefreshKey((k) => k + 1);
  }

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
        if (currentSession) {
          void triggerGmailAutoDetect(currentSession);
        }
      })
      .catch((error: Error) => {
        if (!isMounted) return;
        setAuthError(error.message);
        setAuthLoading(false);
      });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setAuthError(null);
      setAuthLoading(false);

      if (event === "SIGNED_IN" && nextSession?.provider_refresh_token) {
        void apiFetch("/api/user-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gmail_refresh_token: nextSession.provider_refresh_token, gmail_connected: true }),
        })
          .then(() => triggerGmailAutoDetect(nextSession))
          .catch((error) => {
            setAuthError(`Gmail 授權儲存失敗：${error instanceof Error ? error.message : String(error)}`);
          });
      } else if (event === "SIGNED_IN" && nextSession) {
        void triggerGmailAutoDetect(nextSession);
      }
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

  function handleImported() { setReportRefreshKey((k) => k + 1); }
  function handleMappingSaved() { setGmailRefreshKey((k) => k + 1); }

  const authStatusLabel = authLoading ? "登入狀態檢查中" : session ? "已登入" : "未登入";
  const authStatusTone = authLoading ? "warning" : session ? "success" : "info";

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
            className={`app-nav-tab${currentView === "portfolio" ? " active" : ""}`}
            onClick={() => setCurrentView("portfolio")}
            type="button"
          >
            投資組合
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

      {session && currentView !== "settings" && (
        <Suspense fallback={null}>
          <GmailSyncPanel
            session={session}
            onImported={handleImported}
            refreshKey={gmailRefreshKey}
            background
          />
        </Suspense>
      )}

      {currentView === "home" && (
        <Suspense fallback={<section className="two-column"><p>載入中...</p></section>}>
          <section className="home-overview">
            <article className="home-hero-card">
              <div>
                <h2>本週操作重點</h2>
                <p>先完成匯入與分類，再回頭檢視月報與淨值變化。</p>
              </div>
              <div className="home-status-row">
                <span className={`status-pill ${authStatusTone}`}>{authStatusLabel}</span>
                <span className="status-pill info">目前頁籤：總覽</span>
              </div>
            </article>
            <div className="home-kpi-grid">
              <article className="home-kpi-card">
                <p>資料來源</p>
                <strong>設定 → Gmail / 匯入</strong>
                <span>帳單同步與 CSV 匯入在設定頁</span>
              </article>
              <article className="home-kpi-card">
                <p>每月檢查</p>
                <strong>月報分類</strong>
                <span>確認未分類是否下降</span>
              </article>
              <article className="home-kpi-card">
                <p>投資追蹤</p>
                <strong>投資組合</strong>
                <span>持倉明細與淨值走勢</span>
              </article>
            </div>
          </section>

          <section className="home-secondary-workspace">
            <MonthlyReportPanel refreshKey={reportRefreshKey} session={session} />
          </section>
        </Suspense>
      )}

      {currentView === "ledger" && (
        <Suspense fallback={<section className="two-column"><p>載入中...</p></section>}>
          <section className="two-column">
            <CreditCardLedgerPanel session={session} />
          </section>
        </Suspense>
      )}

      {currentView === "bank" && (
        <Suspense fallback={<section className="two-column"><p>載入中...</p></section>}>
          <section className="two-column">
            <BankLedgerPanel session={session} />
          </section>
        </Suspense>
      )}

      {currentView === "loan" && (
        <Suspense fallback={<section className="two-column"><p>載入中...</p></section>}>
          <section className="two-column">
            <LoanPanel session={session} />
          </section>
        </Suspense>
      )}

      {currentView === "insurance" && (
        <Suspense fallback={<section className="two-column"><p>載入中...</p></section>}>
          <section className="two-column">
            <InsurancePanel session={session} />
          </section>
        </Suspense>
      )}

      {currentView === "portfolio" && (
        <Suspense fallback={<section className="two-column"><p>載入中...</p></section>}>
          <section className="two-column">
            <PortfolioPanel refreshKey={reportRefreshKey} session={session} />
          </section>
        </Suspense>
      )}

      {currentView === "settings" && (
        <Suspense fallback={<section className="two-column"><p>載入中...</p></section>}>
          <section className="two-column">
            <GmailSyncPanel session={session} onImported={handleImported} refreshKey={gmailRefreshKey} />
            <ImportPanel
              onImported={handleImported}
              onRecurringTemplatesCreated={() => {}}
              session={session}
            />
          </section>
          <section className="two-column">
            <AccountsPanel session={session} />
            <SettingsPanel session={session} onMappingSaved={handleMappingSaved} />
          </section>
          <section className="two-column">
            <OpsPanel session={session} />
          </section>
        </Suspense>
      )}
    </main>
  );
}
