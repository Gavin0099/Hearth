import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type {
  AccountRecord,
  CreateRecurringTemplateInput,
  RecurringTemplateRecord,
} from "@hearth/shared";
import { fetchAccounts } from "../lib/accounts";
import {
  applyRecurringTemplates,
  createRecurringTemplate,
  deleteRecurringTemplate,
  fetchRecurringTemplates,
  updateRecurringTemplate,
} from "../lib/recurring";

type RecurringTemplatesPanelProps = {
  session: Session | null;
  refreshKey?: number;
  onTemplatesApplied?: () => void;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "success"; items: RecurringTemplateRecord[]; accounts: AccountRecord[] };

const defaultForm: CreateRecurringTemplateInput = {
  account_id: "",
  name: "",
  category: "固定支出",
  amount: null,
  currency: "TWD",
  cadence: "monthly",
  anchor_day: 1,
  source_kind: "manual",
  source_section: "",
  notes: "",
};

type EditForm = {
  name: string;
  category: string;
  amount: string;
  anchor_day: string;
};

function nextMonthYearMonth() {
  const now = new Date();
  const m = now.getMonth() + 2;
  const y = m > 12 ? now.getFullYear() + 1 : now.getFullYear();
  return { year: y, month: m > 12 ? 1 : m };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function RecurringTemplatesPanel({
  session,
  refreshKey = 0,
  onTemplatesApplied,
}: RecurringTemplatesPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [form, setForm] = useState<CreateRecurringTemplateInput>(defaultForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", category: "", amount: "", anchor_day: "" });
  const [editSavingId, setEditSavingId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setState({ status: "idle" });
      setForm(defaultForm);
      setFormError(null);
      setFormSuccess(null);
      setApplyMessage(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      const [accountsResult, recurringResult] = await Promise.all([
        fetchAccounts(),
        fetchRecurringTemplates(),
      ]);
      if (cancelled) {
        return;
      }

      if (accountsResult.status === "error") {
        setState({ status: "error", message: accountsResult.error });
        return;
      }

      if (recurringResult.status === "error") {
        setState({ status: "error", message: recurringResult.error });
        return;
      }

      const accounts = accountsResult.items;
      setState({ status: "success", items: recurringResult.items, accounts });
      setForm((current) => ({
        ...current,
        account_id: current.account_id || accounts[0]?.id || "",
      }));
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [session, refreshKey]);

  function updateForm<K extends keyof CreateRecurringTemplateInput>(
    field: K,
    value: CreateRecurringTemplateInput[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function startEdit(item: RecurringTemplateRecord) {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      category: item.category ?? "",
      amount: item.amount === null ? "" : String(item.amount),
      anchor_day: item.anchor_day === null ? "" : String(item.anchor_day),
    });
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleEditSave(id: string) {
    const name = editForm.name.trim();
    if (!name) {
      setEditError("模板名稱不能為空。");
      return;
    }
    const amount = editForm.amount === "" ? null : Number(editForm.amount);
    if (amount !== null && !Number.isFinite(amount)) {
      setEditError("金額格式無效。");
      return;
    }
    const anchor_day = editForm.anchor_day === "" ? null : Number(editForm.anchor_day);
    if (anchor_day !== null && (!Number.isInteger(anchor_day) || anchor_day < 1 || anchor_day > 31)) {
      setEditError("扣款日須為 1–31 的整數。");
      return;
    }
    setEditSavingId(id);
    setEditError(null);
    const result = await updateRecurringTemplate(id, {
      name,
      category: editForm.category.trim() || null,
      amount,
      anchor_day,
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
        return { ...current, items: current.items.map((t) => (t.id === id ? updated : t)) };
      });
    }
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("確定要刪除此週期模板？")) return;
    setDeletingId(id);
    await deleteRecurringTemplate(id);
    setDeletingId(null);
    setState((current) => {
      if (current.status !== "success") return current;
      return { ...current, items: current.items.filter((t) => t.id !== id) };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setApplyMessage(null);

    if (!form.name?.trim()) {
      setFormError("請先填寫模板名稱。");
      return;
    }

    if (!form.account_id?.trim()) {
      setFormError("請先選擇帳戶。");
      return;
    }

    setIsSubmitting(true);
    const result = await createRecurringTemplate({
      ...form,
      account_id: form.account_id,
      name: form.name.trim(),
      source_section: form.source_section?.trim() || null,
      notes: form.notes?.trim() || null,
      amount:
        form.amount === null || form.amount === undefined || form.amount === 0
          ? null
          : Number(form.amount),
    });
    setIsSubmitting(false);

    if (result.status === "error") {
      setFormError(result.error);
      return;
    }

    const created = result.items[0];
    setState((current) => {
      if (current.status !== "success") {
        return current;
      }

      if (!created) {
        return current;
      }

      return {
        status: "success",
        accounts: current.accounts,
        items: [created, ...current.items],
      };
    });
    setForm((current) => ({
      ...defaultForm,
      account_id: current.account_id,
    }));
    setFormSuccess("週期模板已建立。");
  }

  async function handleApplyCurrentMonth() {
    setFormError(null);
    setFormSuccess(null);
    setApplyMessage(null);

    const now = new Date();
    setIsApplying(true);
    const result = await applyRecurringTemplates({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    });
    setIsApplying(false);

    if (result.status === "error") {
      setApplyMessage(`套用失敗: ${result.error}`);
      return;
    }

    setApplyMessage(`本月已建立 ${result.count} 筆週期交易，跳過 ${result.skipped} 筆既有資料。`);
    onTemplatesApplied?.();
  }

  // Compute next-month preview from templates with amount set
  const nextMonthPreview: { name: string; amount: number; date: string }[] = [];
  if (state.status === "success" && state.items.length > 0) {
    const { year, month } = nextMonthYearMonth();
    const days = daysInMonth(year, month);
    for (const t of state.items) {
      if (t.amount === null || t.cadence !== "monthly") continue;
      const anchor = t.anchor_day && t.anchor_day >= 1 && t.anchor_day <= 31 ? t.anchor_day : 1;
      const day = Math.min(anchor, days);
      nextMonthPreview.push({
        name: t.name,
        amount: Number(t.amount),
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      });
    }
    nextMonthPreview.sort((a, b) => a.date.localeCompare(b.date));
  }

  return (
    <article className="panel">
      <h2>週期模板</h2>
      {!session ? <p>登入後可以管理固定支出與週期模板。</p> : null}
      {state.status === "loading" ? <p>正在載入週期模板...</p> : null}
      {state.status === "error" ? <p>週期模板載入失敗: {state.message}</p> : null}
      {session ? (
        <form className="account-form" onSubmit={handleSubmit}>
          {state.status === "success" ? (
            <label>
              帳戶
              <select
                value={form.account_id}
                onChange={(event) => updateForm("account_id", event.target.value)}
              >
                {state.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            模板名稱
            <input
              value={form.name ?? ""}
              onChange={(event) => updateForm("name", event.target.value)}
              placeholder="例如：房租"
            />
          </label>
          <label>
            類別
            <input
              value={form.category ?? ""}
              onChange={(event) => updateForm("category", event.target.value)}
              placeholder="例如：固定支出"
            />
          </label>
          <label>
            預設金額
            <input
              type="number"
              value={form.amount ?? ""}
              onChange={(event) =>
                updateForm(
                  "amount",
                  event.target.value === "" ? null : Number(event.target.value),
                )
              }
              placeholder="例如：12000"
            />
          </label>
          <label>
            扣款日（1–31）
            <input
              type="number"
              min={1}
              max={31}
              value={form.anchor_day ?? ""}
              onChange={(event) =>
                updateForm(
                  "anchor_day",
                  event.target.value === "" ? null : Number(event.target.value),
                )
              }
            />
            <span className="field-hint">月份天數不足時自動取最後一天</span>
          </label>
          <label>
            來源區塊
            <input
              value={form.source_section ?? ""}
              onChange={(event) => updateForm("source_section", event.target.value)}
              placeholder="例如：週期支出"
            />
          </label>
          <button className="action-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "建立中..." : "新增模板"}
          </button>
          <button
            className="action-button"
            disabled={isApplying}
            onClick={() => void handleApplyCurrentMonth()}
            type="button"
          >
            {isApplying ? "套用中..." : "套用本月模板"}
          </button>
          {formError ? <p>建立失敗: {formError}</p> : null}
          {formSuccess ? <p>{formSuccess}</p> : null}
          {applyMessage ? <p>{applyMessage}</p> : null}
        </form>
      ) : null}
      {state.status === "success" ? (
        state.items.length > 0 ? (
          <>
            <ul>
              {state.items.map((item) =>
                editingId === item.id ? (
                  <li key={item.id} className="account-list-item account-list-item--editing">
                    <div className="account-edit-form">
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="模板名稱"
                      />
                      <input
                        value={editForm.category}
                        onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                        placeholder="類別（可留空）"
                      />
                      <input
                        type="number"
                        value={editForm.amount}
                        onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                        placeholder="金額（可留空）"
                        style={{ width: "7rem" }}
                      />
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={editForm.anchor_day}
                        onChange={(e) => setEditForm((f) => ({ ...f, anchor_day: e.target.value }))}
                        placeholder="扣款日"
                        style={{ width: "5rem" }}
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
                        {item.category ?? "未分類"} ·{" "}
                        {item.amount === null ? "未設定金額" : `NT$ ${Number(item.amount).toLocaleString()}`}
                        {item.anchor_day ? ` · ${item.anchor_day} 日` : ""}
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
            {nextMonthPreview.length > 0 ? (
              <section className="recurring-preview">
                <h4>下個月預計產生（{nextMonthPreview.length} 筆）</h4>
                <ul className="recurring-preview-list">
                  {nextMonthPreview.map((p) => (
                    <li key={p.date + p.name} className="recurring-preview-item">
                      <span className="recurring-preview-date">{p.date.slice(5)}</span>
                      <span className="recurring-preview-name">{p.name}</span>
                      <span className="recurring-preview-amount">NT$ {p.amount.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : (
          <p>目前還沒有週期模板，可以先建立房租、月費、學費這類固定項目。</p>
        )
      ) : null}
    </article>
  );
}
