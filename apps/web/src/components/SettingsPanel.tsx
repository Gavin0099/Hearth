import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  fetchUserSettings,
  saveUserSettings,
  type SaveUserSettingsInput,
  type UserSettings,
} from "../lib/user-settings";
import { fetchAccounts } from "../lib/accounts";
import type { AccountRecord } from "@hearth/shared";
import {
  fetchBankAccountMappings,
  upsertBankAccountMapping,
  deleteBankAccountMapping,
  type BankAccountMappingRecord,
} from "../lib/import-jobs";

type SettingsPanelProps = {
  session: Session | null;
  onMappingSaved?: () => void;
};

const BANK_DISPLAY_NAMES: Record<string, string> = {
  sinopac: "永豐",
  esun: "玉山",
  cathay: "國泰",
  taishin: "台新",
  ctbc: "中信",
  mega: "兆豐",
};

const ALL_BANKS = ["sinopac", "esun", "cathay", "taishin", "ctbc", "mega"] as const;
const SOURCE_TYPE_LABELS: Record<string, string> = {
  credit_card: "信用卡",
  bank_account: "銀行帳戶",
};

function StatusText({ enabled }: { enabled: boolean | undefined }) {
  return <span>{enabled ? "已設定" : "未設定"}</span>;
}

function BankAccountMappingSection({ session, onMappingSaved }: { session: Session; onMappingSaved?: () => void }) {
  const [mappings, setMappings] = useState<BankAccountMappingRecord[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [newBank, setNewBank] = useState("sinopac");
  const [newSourceType, setNewSourceType] = useState<"credit_card" | "bank_account">("credit_card");
  const [newAccountId, setNewAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetchBankAccountMappings().then((res) => {
      if (res.status === "ok") setMappings(res.items);
    });
    void fetchAccounts().then((res) => {
      if (res.status === "ok") {
        setAccounts(res.items);
        if (res.items.length > 0) setNewAccountId(res.items[0].id);
      }
    });
  }, [session]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newAccountId) return;
    setSaving(true);
    setMessage(null);
    const res = await upsertBankAccountMapping({ bank_key: newBank, source_type: newSourceType, account_id: newAccountId });
    if (res.status === "ok") {
      const refreshed = await fetchBankAccountMappings();
      if (refreshed.status === "ok") setMappings(refreshed.items);
      setMessage("對應已儲存。");
      onMappingSaved?.();
    } else {
      setMessage(`儲存失敗：${res.error}`);
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await deleteBankAccountMapping(id);
    setMappings((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <section>
      <h3>Gmail 自動匯入帳戶對應</h3>
      <p className="panel-copy panel-copy--tight">
        設定各銀行帳單對應的帳戶。未設定的銀行帳單會進入待審查佇列，不會自動匯入。
      </p>

      {mappings.length > 0 ? (
        <ul className="gmail-email-list">
          {mappings.map((m) => {
            const account = accounts.find((a) => a.id === m.account_id);
            return (
              <li key={m.id} className="gmail-email-item panel-row-item">
                <div className="gmail-email-meta">
                  <span className="gmail-email-bank">{BANK_DISPLAY_NAMES[m.bank_key] ?? m.bank_key}</span>
                  <span>{SOURCE_TYPE_LABELS[m.source_type] ?? m.source_type}</span>
                  <span className="panel-copy--tight">→ {account?.name ?? m.account_id}</span>
                </div>
                <button
                  className="action-button"
                  type="button"
                  onClick={() => void handleDelete(m.id)}
                >
                  刪除
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="panel-message panel-message--muted">尚未設定任何對應。</p>
      )}

      <form className="account-form" onSubmit={handleAdd}>
        <label>
          銀行
          <select value={newBank} onChange={(e) => setNewBank(e.target.value)}>
            {ALL_BANKS.map((b) => (
              <option key={b} value={b}>{BANK_DISPLAY_NAMES[b]}</option>
            ))}
          </select>
        </label>
        <label>
          類型
          <select value={newSourceType} onChange={(e) => setNewSourceType(e.target.value as "credit_card" | "bank_account")}>
            <option value="credit_card">信用卡</option>
            <option value="bank_account">銀行帳戶</option>
          </select>
        </label>
        <label>
          帳戶
          <select value={newAccountId} onChange={(e) => setNewAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <button className="action-button" type="submit" disabled={saving || !newAccountId}>
          {saving ? "儲存中..." : "新增對應"}
        </button>
        {message && <p className="panel-message">{message}</p>}
      </form>
    </section>
  );
}

export function SettingsPanel({ session, onMappingSaved }: SettingsPanelProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [defaultPw, setDefaultPw] = useState("");
  const [sinopacPw, setSinopacPw] = useState("");
  const [esunPw, setEsunPw] = useState("");
  const [taishinPw, setTaishinPw] = useState("");
  const [clearDefaultPw, setClearDefaultPw] = useState(false);
  const [clearSinopacPw, setClearSinopacPw] = useState(false);
  const [clearEsunPw, setClearEsunPw] = useState(false);
  const [clearTaishinPw, setClearTaishinPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setSettings(null);
      setDefaultPw("");
      setSinopacPw("");
      setEsunPw("");
      setTaishinPw("");
      setClearDefaultPw(false);
      setClearSinopacPw(false);
      setClearEsunPw(false);
      setClearTaishinPw(false);
      return;
    }

    fetchUserSettings()
      .then((s) => {
        setSettings(s);
        setDefaultPw("");
        setSinopacPw("");
        setEsunPw("");
        setTaishinPw("");
        setClearDefaultPw(false);
        setClearSinopacPw(false);
        setClearEsunPw(false);
        setClearTaishinPw(false);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "讀取設定失敗");
      });
  }, [session]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const payload: SaveUserSettingsInput = {};

      if (defaultPw.trim()) payload.default_pdf_password = defaultPw.trim();
      if (sinopacPw.trim()) payload.sinopac_pdf_password = sinopacPw.trim();
      if (esunPw.trim()) payload.esun_pdf_password = esunPw.trim();
      if (taishinPw.trim()) payload.taishin_pdf_password = taishinPw.trim();

      if (clearDefaultPw) payload.clear_default_pdf_password = true;
      if (clearSinopacPw) payload.clear_sinopac_pdf_password = true;
      if (clearEsunPw) payload.clear_esun_pdf_password = true;
      if (clearTaishinPw) payload.clear_taishin_pdf_password = true;

      await saveUserSettings(payload);
      const refreshed = await fetchUserSettings();
      setSettings(refreshed);
      setDefaultPw("");
      setSinopacPw("");
      setEsunPw("");
      setTaishinPw("");
      setClearDefaultPw(false);
      setClearSinopacPw(false);
      setClearEsunPw(false);
      setClearTaishinPw(false);
      setMessage("密碼設定已更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "儲存失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;

  return (
    <article className="panel settings-panel">
      <h2>密碼設定</h2>
      <p className="panel-copy panel-copy--tight">
        設定頁不再回顯 PDF 密碼明文。這些欄位目前採 write-only；同步時才會顯式讀取秘密資料。
      </p>
      <form className="account-form" onSubmit={handleSave}>
        <label>
          預設 PDF 密碼（適用所有銀行）
          <StatusText enabled={settings?.has_default_pdf_password} />
          <input
            type="password"
            value={defaultPw}
            onChange={(e) => {
              setDefaultPw(e.target.value);
              setClearDefaultPw(false);
            }}
            placeholder="輸入新預設密碼；留空代表不變更"
            autoComplete="off"
          />
          <button
            className="action-button"
            type="button"
            onClick={() => {
              setDefaultPw("");
              setClearDefaultPw(true);
            }}
          >
            清除
          </button>
        </label>
        <label>
          永豐信用卡 PDF 密碼（覆蓋預設）
          <StatusText enabled={settings?.has_sinopac_pdf_password} />
          <input
            type="password"
            value={sinopacPw}
            onChange={(e) => {
              setSinopacPw(e.target.value);
              setClearSinopacPw(false);
            }}
            placeholder="輸入新永豐密碼；留空代表不變更"
            autoComplete="off"
          />
          <button
            className="action-button"
            type="button"
            onClick={() => {
              setSinopacPw("");
              setClearSinopacPw(true);
            }}
          >
            清除
          </button>
        </label>
        <label>
          玉山信用卡 PDF 密碼（覆蓋預設）
          <StatusText enabled={settings?.has_esun_pdf_password} />
          <input
            type="password"
            value={esunPw}
            onChange={(e) => {
              setEsunPw(e.target.value);
              setClearEsunPw(false);
            }}
            placeholder="輸入新玉山密碼；留空代表不變更"
            autoComplete="off"
          />
          <button
            className="action-button"
            type="button"
            onClick={() => {
              setEsunPw("");
              setClearEsunPw(true);
            }}
          >
            清除
          </button>
        </label>
        <label>
          台新信用卡 PDF 密碼（覆蓋預設）
          <StatusText enabled={settings?.has_taishin_pdf_password} />
          <input
            type="password"
            value={taishinPw}
            onChange={(e) => {
              setTaishinPw(e.target.value);
              setClearTaishinPw(false);
            }}
            placeholder="輸入新台新密碼；留空代表不變更"
            autoComplete="off"
          />
          <button
            className="action-button"
            type="button"
            onClick={() => {
              setTaishinPw("");
              setClearTaishinPw(true);
            }}
          >
            清除
          </button>
        </label>
        <button className="action-button" type="submit" disabled={saving}>
          {saving ? "儲存中..." : "儲存設定"}
        </button>
        {message ? <p className="panel-message">{message}</p> : null}
      </form>
      {settings?.gmail_last_sync_at ? (
        <p className="panel-message panel-message--muted">
          上次 Gmail 同步：{new Date(settings.gmail_last_sync_at).toLocaleString("zh-TW")}
        </p>
      ) : null}

      <BankAccountMappingSection session={session} onMappingSaved={onMappingSaved} />
    </article>
  );
}
