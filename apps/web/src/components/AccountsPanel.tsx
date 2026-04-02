import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  accountTypes,
  type AccountRecord,
  type AccountType,
  type CreateAccountInput,
} from "@hearth/shared";
import { createAccount, deleteAccount, fetchAccounts, updateAccount } from "../lib/accounts";

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "success"; items: AccountRecord[] };

type AccountsPanelProps = {
  session: Session | null;
};

const defaultFormState: CreateAccountInput = {
  name: "",
  type: "cash_bank",
  currency: "TWD",
  broker: "",
};

type EditForm = { name: string; currency: string; broker: string };

export function AccountsPanel({ session }: AccountsPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [form, setForm] = useState<CreateAccountInput>(defaultFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", currency: "", broker: "" });
  const [editSavingId, setEditSavingId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setState({ status: "idle" });
      setForm(defaultFormState);
      setFormError(null);
      setFormSuccess(null);
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

  function updateForm<K extends keyof CreateAccountInput>(
    field: K,
    value: CreateAccountInput[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function startEdit(item: AccountRecord) {
    setEditingId(item.id);
    setEditForm({ name: item.name, currency: item.currency, broker: item.broker ?? "" });
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleEditSave(id: string) {
    const name = editForm.name.trim();
    if (!name) {
      setEditError("帳戶名稱不能為空。");
      return;
    }
    setEditSavingId(id);
    setEditError(null);
    const result = await updateAccount(id, {
      name,
      currency: editForm.currency.trim() || "TWD",
      broker: editForm.broker.trim() || null,
    });
    setEditSavingId(null);
    if (result.status === "error") {
      setEditError(result.error);
      return;
    }
    const updated = result.items[0];
    if (updated) {
      setState((current) => {
        if (current.status !== "success") return current;
        return { ...current, items: current.items.map((a) => (a.id === id ? updated : a)) };
      });
    }
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("確定要刪除此帳戶？這也會刪除所有相關交易記錄。")) return;
    setDeletingId(id);
    await deleteAccount(id);
    setDeletingId(null);
    setState((current) => {
      if (current.status !== "success") return current;
      return { ...current, items: current.items.filter((a) => a.id !== id) };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!form.name?.trim()) {
      setFormError("請先填寫帳戶名稱。");
      return;
    }

    setIsSubmitting(true);
    const result = await createAccount({
      name: form.name.trim(),
      type: form.type as AccountType,
      currency: form.currency?.trim() || "TWD",
      broker: form.broker?.trim() || null,
    });
    setIsSubmitting(false);

    if (result.status === "error") {
      setFormError(result.error);
      return;
    }

    const createdItem = result.items[0];
    setState((current) => {
      if (current.status !== "success") {
        return {
          status: "success",
          items: createdItem ? [createdItem] : [],
        };
      }

      return {
        status: "success",
        items: createdItem ? [createdItem, ...current.items] : current.items,
      };
    });
    setForm(defaultFormState);
    setFormSuccess("帳戶已建立。");
  }

  return (
    <article className="panel">
      <h2>帳戶狀態</h2>
      {!session ? <p>登入後會自動讀取目前使用者的帳戶資料。</p> : null}
      {session ? (
        <form className="account-form" onSubmit={handleSubmit}>
          <label>
            帳戶名稱
            <input
              value={form.name ?? ""}
              onChange={(event) => updateForm("name", event.target.value)}
              placeholder="例如：永豐台股"
            />
          </label>
          <label>
            帳戶類型
            <select
              value={form.type}
              onChange={(event) => updateForm("type", event.target.value as AccountType)}
            >
              {accountTypes.map((type) => (
                <option key={type} value={type}>
                  {type === "cash_bank" ? "現金／銀行" : type === "cash_credit" ? "信用卡" : type === "investment_tw" ? "台股投資" : "海外投資"}
                </option>
              ))}
            </select>
          </label>
          <label>
            幣別
            <input
              value={form.currency ?? ""}
              onChange={(event) => updateForm("currency", event.target.value.toUpperCase())}
              placeholder="TWD"
            />
          </label>
          <label>
            券商 / 備註
            <input
              value={form.broker ?? ""}
              onChange={(event) => updateForm("broker", event.target.value)}
              placeholder="例如：Sinopac"
            />
          </label>
          <button className="action-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "建立中..." : "新增帳戶"}
          </button>
          {formError ? <p>建立失敗: {formError}</p> : null}
          {formSuccess ? <p>{formSuccess}</p> : null}
        </form>
      ) : null}
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
            {state.items.map((item) =>
              editingId === item.id ? (
                <li key={item.id} className="account-list-item account-list-item--editing">
                  <div className="account-edit-form">
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="帳戶名稱"
                    />
                    <input
                      value={editForm.currency}
                      onChange={(e) => setEditForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                      placeholder="幣別"
                      style={{ width: "5rem" }}
                    />
                    <input
                      value={editForm.broker}
                      onChange={(e) => setEditForm((f) => ({ ...f, broker: e.target.value }))}
                      placeholder="券商 / 備註（可留空）"
                    />
                    {editError ? <span className="account-edit-error">{editError}</span> : null}
                  </div>
                  <div className="account-item-actions">
                    <button
                      className="action-button"
                      type="button"
                      disabled={editSavingId === item.id}
                      onClick={() => void handleEditSave(item.id)}
                    >
                      {editSavingId === item.id ? "儲存中..." : "儲存"}
                    </button>
                    <button className="action-button" type="button" onClick={cancelEdit}>
                      取消
                    </button>
                  </div>
                </li>
              ) : (
                <li key={item.id} className="account-list-item">
                  <span className="account-item-label">
                    {item.name}
                    <span className="account-item-meta">
                      {item.type === "cash_bank" ? "現金／銀行" : item.type === "cash_credit" ? "信用卡" : item.type === "investment_tw" ? "台股" : "海外"} · {item.currency}
                      {item.broker ? ` · ${item.broker}` : ""}
                    </span>
                  </span>
                  <div className="account-item-actions">
                    <button
                      className="action-button"
                      type="button"
                      onClick={() => startEdit(item)}
                    >
                      編輯
                    </button>
                    <button
                      className="action-button action-button-danger"
                      type="button"
                      disabled={deletingId === item.id}
                      onClick={() => void handleDelete(item.id)}
                    >
                      {deletingId === item.id ? "刪除中..." : "刪除"}
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>
        ) : (
          <p>目前沒有帳戶資料。下一步可以先建立第一個現金或投資帳戶。</p>
        )
      ) : null}
    </article>
  );
}
