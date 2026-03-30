export type TransactionCategory = {
  id: string;
  label: string;
  keywords: string[];
};

export const transactionCategories: TransactionCategory[] = [
  {
    id: "lifestyle",
    label: "生活",
    keywords: ["超商", "日用品", "生活用品", "雜貨", "7-11", "7-eleven", "全家", "familymart"],
  },
  {
    id: "food",
    label: "餐飲",
    keywords: [
      "早餐",
      "午餐",
      "晚餐",
      "咖啡",
      "外送",
      "餐廳",
      "uber eats",
      "foodpanda",
      "restaurant",
      "cafe",
      "breakfast",
      "lunch",
      "dinner",
    ],
  },
  {
    id: "shopping",
    label: "購物",
    keywords: ["蝦皮", "momo", "pchome", "百貨", "網購", "購物"],
  },
  {
    id: "transport",
    label: "交通",
    keywords: ["捷運", "高鐵", "台鐵", "停車", "計程車", "加油"],
  },
  {
    id: "education",
    label: "教育",
    keywords: ["學費", "課程", "教材", "補習"],
  },
  {
    id: "medical",
    label: "醫療",
    keywords: ["診所", "醫院", "藥局", "保健"],
  },
  {
    id: "housing",
    label: "居住",
    keywords: ["房租", "管理費", "水電", "瓦斯", "網路", "租金"],
  },
  {
    id: "family",
    label: "家庭",
    keywords: ["孝親", "育兒", "幼稚園", "保母"],
  },
  {
    id: "entertainment",
    label: "娛樂",
    keywords: ["電影", "遊戲", "steam", "netflix", "spotify", "娛樂"],
  },
  {
    id: "investment",
    label: "投資",
    keywords: ["券商", "證券", "etf", "基金", "投資", "股票"],
  },
  {
    id: "insurance",
    label: "保險",
    keywords: ["保費", "人壽", "保險"],
  },
  {
    id: "credit_card_payment",
    label: "信用卡繳款",
    keywords: ["信用卡款", "卡費", "信用卡繳款", "繳卡費", "信用卡費"],
  },
  {
    id: "loan",
    label: "貸款",
    keywords: ["房貸", "信貸", "貸款", "放款本息"],
  },
  {
    id: "pledge_loan_borrow",
    label: "質借借款",
    keywords: ["質借借款", "質借撥款", "質借入帳"],
  },
  {
    id: "pledge_loan_repayment",
    label: "質借還款",
    keywords: ["質借還款", "質借扣款", "質借償還"],
  },
  {
    id: "tax_fee",
    label: "稅費",
    keywords: ["稅", "健保", "國民年金", "手續費", "規費"],
  },
  {
    id: "salary",
    label: "薪資",
    keywords: ["薪資", "薪轉", "薪資轉帳"],
  },
  {
    id: "interest_income",
    label: "利息",
    keywords: ["利息"],
  },
  {
    id: "refund",
    label: "退款",
    keywords: ["退款", "退費", "退刷", "refund"],
  },
  {
    id: "allowance",
    label: "折讓款",
    keywords: ["折讓款", "折讓", "折抵", "帳單折抵", "回饋折抵", "折讓金"],
  },
  {
    id: "transfer",
    label: "轉帳",
    keywords: ["轉帳", "匯款", "atm", "跨行轉", "提領", "自扣"],
  },
  {
    id: "other",
    label: "其他",
    keywords: [],
  },
];
