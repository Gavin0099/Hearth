import type {
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
