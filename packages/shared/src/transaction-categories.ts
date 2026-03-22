export type TransactionCategory = {
  id: string;
  label: string;
  keywords: string[];
};

export const transactionCategories: TransactionCategory[] = [
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
    id: "groceries",
    label: "生活購物",
    keywords: ["超市", "日用品", "全聯", "家樂福", "蝦皮"],
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
    keywords: ["房租", "管理費", "水電", "瓦斯", "網路"],
  },
  {
    id: "family",
    label: "家庭",
    keywords: ["孝親", "育兒", "幼稚園", "保母"],
  },
  {
    id: "other",
    label: "其他",
    keywords: [],
  },
];
