type GmailSourceType = "credit_card" | "bank_account";

export type GmailAccountMappingRow = {
  bank_key: string;
  source_type: GmailSourceType;
  account_id: string;
};

export type GmailAccountCandidate = {
  id: string;
  name: string;
  type: string;
  broker?: string | null;
};

const BANK_ACCOUNT_KEYWORDS: Record<string, string[]> = {
  sinopac: ["永豐", "sinopac"],
  esun: ["玉山", "esun"],
  cathay: ["國泰", "cathay"],
  taishin: ["台新", "taishin"],
  ctbc: ["中信", "中國信託", "ctbc"],
  mega: ["兆豐", "mega"],
};

function accountTypeForSourceType(sourceType: GmailSourceType) {
  return sourceType === "credit_card" ? "cash_credit" : "cash_bank";
}

function includesBankKeyword(account: GmailAccountCandidate, bankKey: string) {
  const keywords = BANK_ACCOUNT_KEYWORDS[bankKey] ?? [bankKey];
  const haystack = `${account.name} ${account.broker ?? ""}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

export function buildGmailAccountMappingIndex(
  mappings: GmailAccountMappingRow[] | null | undefined,
  accounts: GmailAccountCandidate[] | null | undefined,
) {
  const index: Record<string, string> = {};
  for (const mapping of mappings ?? []) {
    index[`${mapping.bank_key}:${mapping.source_type}`] = mapping.account_id;
  }

  for (const bankKey of Object.keys(BANK_ACCOUNT_KEYWORDS)) {
    for (const sourceType of ["credit_card", "bank_account"] as const) {
      const key = `${bankKey}:${sourceType}`;
      if (index[key]) continue;

      const targetAccountType = accountTypeForSourceType(sourceType);
      const candidates = (accounts ?? []).filter((account) =>
        account.type === targetAccountType && includesBankKeyword(account, bankKey)
      );
      if (candidates.length === 1) {
        index[key] = candidates[0].id;
      }
    }
  }

  return index;
}
