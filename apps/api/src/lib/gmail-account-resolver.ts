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

const BANK_DISPLAY_NAMES: Record<string, string> = {
  sinopac: "永豐",
  esun: "玉山",
  cathay: "國泰",
  taishin: "台新",
  ctbc: "中信",
  mega: "兆豐",
};

function accountTypeForSourceType(sourceType: GmailSourceType) {
  return sourceType === "credit_card" ? "cash_credit" : "cash_bank";
}

function isAccountCompatibleWithSourceType(
  account: GmailAccountCandidate | null | undefined,
  sourceType: GmailSourceType,
) {
  return !!account && account.type === accountTypeForSourceType(sourceType);
}

function accountNameForSourceType(bankKey: string, sourceType: GmailSourceType) {
  const bankName = BANK_DISPLAY_NAMES[bankKey] ?? bankKey;
  return `${bankName} ${sourceType === "credit_card" ? "信用卡" : "銀行帳戶"}`;
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
  const accountsById = new Map((accounts ?? []).map((account) => [account.id, account]));
  for (const mapping of mappings ?? []) {
    const account = accountsById.get(mapping.account_id);
    if (!isAccountCompatibleWithSourceType(account, mapping.source_type)) {
      continue;
    }
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

function resolveExistingGmailAccountId(
  bankKey: string,
  sourceType: GmailSourceType,
  accounts: GmailAccountCandidate[] | null | undefined,
) {
  const targetAccountType = accountTypeForSourceType(sourceType);
  const candidates = (accounts ?? []).filter((account) =>
    account.type === targetAccountType && includesBankKeyword(account, bankKey)
  );
  return candidates.length === 1 ? candidates[0].id : null;
}

export async function resolveOrCreateGmailImportAccountId(
  supabase: {
    from: (table: string) => any;
  },
  userId: string,
  index: Record<string, string>,
  accounts: GmailAccountCandidate[],
  bankKey: string,
  sourceType: GmailSourceType,
) {
  const key = `${bankKey}:${sourceType}`;
  if (index[key]) {
    const indexedAccount = accounts.find((account) => account.id === index[key]);
    if (isAccountCompatibleWithSourceType(indexedAccount, sourceType)) {
      return index[key];
    }
    delete index[key];
  }

  const existingId = resolveExistingGmailAccountId(bankKey, sourceType, accounts);
  if (existingId) {
    index[key] = existingId;
    return existingId;
  }

  const accountName = accountNameForSourceType(bankKey, sourceType);
  const accountType = accountTypeForSourceType(sourceType);
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: userId,
      name: accountName,
      type: accountType,
      currency: "TWD",
      broker: bankKey,
    })
    .select("id, name, type, broker")
    .single();

  if (error || !data?.id) return null;

  const created = {
    id: data.id,
    name: data.name ?? accountName,
    type: data.type ?? accountType,
    broker: data.broker ?? bankKey,
  };
  accounts.push(created);
  index[key] = created.id;
  return created.id;
}
