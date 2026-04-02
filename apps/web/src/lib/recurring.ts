import type {
  ApplyRecurringTemplatesInput,
  ApplyRecurringTemplatesResponse,
  CreateRecurringTemplatesFromCandidatesInput,
  CreateRecurringTemplateInput,
  RecurringTemplatesResponse,
} from "@hearth/shared";
import { apiFetch } from "./api";

export async function fetchRecurringTemplates() {
  const response = await apiFetch("/api/recurring-templates");
  return (await response.json()) as RecurringTemplatesResponse;
}

export async function createRecurringTemplate(input: CreateRecurringTemplateInput) {
  const response = await apiFetch("/api/recurring-templates", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return (await response.json()) as RecurringTemplatesResponse;
}

export async function createRecurringTemplatesFromCandidates(
  input: CreateRecurringTemplatesFromCandidatesInput,
) {
  const response = await apiFetch("/api/recurring-templates/from-import-candidates", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return (await response.json()) as RecurringTemplatesResponse;
}

export async function updateRecurringTemplate(
  id: string,
  payload: { name?: string; category?: string | null; amount?: number | null; anchor_day?: number | null },
) {
  const response = await apiFetch(`/api/recurring-templates/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await response.json()) as RecurringTemplatesResponse;
}

export async function deleteRecurringTemplate(id: string) {
  const response = await apiFetch(`/api/recurring-templates/${id}`, { method: "DELETE" });
  return (await response.json()) as { status: "ok" } | { error: string; status: "error" };
}

export async function applyRecurringTemplates(input: ApplyRecurringTemplatesInput) {
  const response = await apiFetch("/api/recurring-templates/apply", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return (await response.json()) as ApplyRecurringTemplatesResponse;
}
