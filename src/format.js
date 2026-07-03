export function money(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

export function number(value, digits = 1) {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(Number(value || 0));
}

export function percent(value, digits = 1) {
  return `${number(Number(value || 0) * 100, digits)}%`;
}

export function shortDate(value) {
  return String(value || "").slice(5);
}

export function profitTone(value) {
  if (Number(value) > 0) return "positive";
  if (Number(value) < 0) return "negative";
  return "neutral";
}
