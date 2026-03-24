import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { fetchUserSettings, saveUserSettings, type UserSettings } from "../lib/user-settings";

type SettingsPanelProps = {
  session: Session | null;
};

export function SettingsPanel({ session }: SettingsPanelProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [defaultPw, setDefaultPw] = useState("");
  const [sinopacPw, setSinopacPw] = useState("");
  const [esunPw, setEsunPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setSettings(null);
      return;
    }
    fetchUserSettings().then((s) => {
      setSettings(s);
      setDefaultPw(s.default_pdf_password ?? "");
      setSinopacPw(s.sinopac_pdf_password ?? "");
      setEsunPw(s.esun_pdf_password ?? "");
    }).catch(() => {});
  }, [session]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await saveUserSettings({
        default_pdf_password: defaultPw.trim() || null,
        sinopac_pdf_password: sinopacPw.trim() || null,
        esun_pdf_password: esunPw.trim() || null,
      });
      setMessage("設定已儲存。");
    } catch {
      setMessage("儲存失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;

  return (
    <article className="panel">
      <h2>帳單設定</h2>
      <p>儲存各銀行 PDF 帳單密碼（通常為身分證字號），供自動解密使用。</p>
      <form className="account-form" onSubmit={handleSave}>
        <label>
          預設 PDF 密碼（適用所有銀行）
          <input
            type="password"
            value={defaultPw}
            onChange={(e) => setDefaultPw(e.target.value)}
            placeholder="身分證字號（大寫）"
            autoComplete="off"
          />
        </label>
        <label>
          永豐信用卡 PDF 密碼（覆蓋預設）
          <input
            type="password"
            value={sinopacPw}
            onChange={(e) => setSinopacPw(e.target.value)}
            placeholder="身分證字號（大寫）"
            autoComplete="off"
          />
        </label>
        <label>
          玉山信用卡 PDF 密碼（覆蓋預設）
          <input
            type="password"
            value={esunPw}
            onChange={(e) => setEsunPw(e.target.value)}
            placeholder="身分證字號（大寫）"
            autoComplete="off"
          />
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
