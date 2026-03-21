import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type {
  CreateRecurringTemplateInput,
  RecurringTemplateRecord,
} from "@hearth/shared";
import { createRecurringTemplate, fetchRecurringTemplates } from "../lib/recurring";

type RecurringTemplatesPanelProps = {
  session: Session | null;
  refreshKey?: number;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "success"; items: RecurringTemplateRecord[] };

const defaultForm: CreateRecurringTemplateInput = {
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

export function RecurringTemplatesPanel({ session, refreshKey = 0 }: RecurringTemplatesPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [form, setForm] = useState<CreateRecurringTemplateInput>(defaultForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!session) {
      setState({ status: "idle" });
      setForm(defaultForm);
      setFormError(null);
      setFormSuccess(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      const result = await fetchRecurringTemplates();
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

    if (!form.name?.trim()) {
      setFormError("請先填寫模板名稱。");
      return;
    }

    setIsSubmitting(true);
    const result = await createRecurringTemplate({
      ...form,
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
      if (current.status !== "success" || !created) {
        return {
          status: "success",
          items: created ? [created] : [],
        };
      }

      return {
        status: "success",
        items: [created, ...current.items],
      };
    });
    setForm(defaultForm);
    setFormSuccess("週期模板已建立。");
  }

  return (
    <article className="panel">
      <h2>週期模板</h2>
      {!session ? <p>登入後可以管理固定支出與週期模板。</p> : null}
      {state.status === "loading" ? <p>正在載入週期模板...</p> : null}
      {state.status === "error" ? <p>週期模板載入失敗: {state.message}</p> : null}
      {session ? (
        <form className="account-form" onSubmit={handleSubmit}>
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
          {formError ? <p>建立失敗: {formError}</p> : null}
          {formSuccess ? <p>{formSuccess}</p> : null}
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
