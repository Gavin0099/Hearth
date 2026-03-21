export const accountTypes = [
  "cash_bank",
  "cash_credit",
  "investment_tw",
  "investment_foreign",
] as const;

export type AccountType = (typeof accountTypes)[number];

export type AccountRecord = {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  broker: string | null;
  created_at: string;
};

export type CreateAccountInput = {
  name: string;
  type: AccountType;
  currency?: string;
  broker?: string | null;
};

export function isAccountType(value: string): value is AccountType {
  return accountTypes.includes(value as AccountType);
}

export function normalizeCurrency(value: string | undefined) {
  return (value ?? "TWD").trim().toUpperCase();
}
