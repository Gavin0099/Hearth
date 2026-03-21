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
  fetchRecurringTemplates,
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
            扣款日
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
          <ul>
            {state.items.map((item) => (
              <li key={item.id}>
                {item.name} / {item.category ?? "未分類"} /{" "}
                {item.amount === null ? "未設定金額" : `NT$ ${Number(item.amount).toFixed(2)}`}
              </li>
            ))}
          </ul>
        ) : (
          <p>目前還沒有週期模板，可以先建立房租、月費、學費這類固定項目。</p>
        )
      ) : null}
    </article>
  );
}
