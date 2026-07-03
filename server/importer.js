import XLSX from "xlsx";
import { inferStatus } from "./db.js";

export function parseLedgerWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames.includes("投注明细") ? "投注明细" : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  const headerIndex = rows.findIndex((row) => row.includes("日期") && row.some((cell) => String(cell).includes("投入")));
  if (headerIndex < 0) {
    throw new Error("没有找到投注明细表头，请确认包含“日期”和“投入”列");
  }

  const headers = rows[headerIndex].map((cell) => String(cell).trim());
  const indexOf = (name) => headers.findIndex((header) => header.includes(name));
  const idx = {
    date: indexOf("日期"),
    match: headers.findIndex((header) => header.includes("场次")),
    pick: headers.findIndex((header) => header.includes("投注内容") || header.includes("比分")),
    stake: indexOf("投入"),
    profit: headers.findIndex((header) => header.includes("盈利") || header.includes("亏损")),
    returnAmount: headers.findIndex((header) => header.includes("结余") || header.includes("返还")),
    score: headers.findIndex((header) => header.includes("实际比分")),
    note: indexOf("备注")
  };

  return rows.slice(headerIndex + 1).flatMap((row) => {
    if (!row.some(Boolean)) return [];
    const date = normalizeDate(row[idx.date]);
    const match = String(row[idx.match] || "").trim();
    const stake = toNumber(row[idx.stake]);
    const returnAmount = toNumber(row[idx.returnAmount]);
    const note = String(row[idx.note] || "").trim();
    if (!date || !match) return [];

    return {
      date,
      match,
      pick: String(row[idx.pick] || "").trim(),
      stake,
      returnAmount,
      profit: toNumber(row[idx.profit] || returnAmount - stake),
      score: String(row[idx.score] || "").trim(),
      note,
      status: inferStatus({ profit: returnAmount - stake, stake, returnAmount, note })
    };
  });
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const month = String(parsed.m).padStart(2, "0");
      const day = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${month}-${day}`;
    }
  }
  const text = String(value || "").trim().replace(/\//g, "-");
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const n = Number(String(value).replace(/[¥,\s]/g, ""));
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}
