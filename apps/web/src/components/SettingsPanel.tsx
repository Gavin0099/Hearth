import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  fetchUserSettings,
  saveUserSettings,
  type SaveUserSettingsInput,
  type UserSettings,
} from "../lib/user-settings";

type SettingsPanelProps = {
  session: Session | null;
};

function StatusText({ enabled }: { enabled: boolean | undefined }) {
  return <span>{enabled ? "已設定" : "未設定"}</span>;
}

export function SettingsPanel({ session }: SettingsPanelProps) {
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
    <article className="panel">
      <h2>密碼設定</h2>
      <p>設定頁不再回顯 PDF 密碼明文。這些欄位目前採 write-only；同步時才會顯式讀取秘密資料。</p>
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
        {message ? <p>{message}</p> : null}
      </form>
      {settings?.gmail_last_sync_at ? (
        <p>上次 Gmail 同步：{new Date(settings.gmail_last_sync_at).toLocaleString("zh-TW")}</p>
      ) : null}
    </article>
  );
}
