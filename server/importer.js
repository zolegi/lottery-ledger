import XLSX from "xlsx";
import { inferStatus } from "./db.js";

export function parseLedgerWorkbook(buffer) {
  for (const options of [
    { type: "buffer", cellDates: true, codepage: 65001 },
    { type: "buffer", cellDates: true, codepage: 936 },
    { type: "buffer", cellDates: true }
  ]) {
    const parsed = parseWorkbook(XLSX.read(buffer, options));
    if (parsed) return parsed;
  }

  throw new Error("没有找到投注明细表头，请确认任意工作表中包含“日期”和“投入”列");
}

function parseWorkbook(workbook) {
  for (const sheetName of prioritizeSheetNames(workbook.SheetNames)) {
    const parsed = parseLedgerSheet(workbook.Sheets[sheetName]);
    if (parsed) return parsed;
  }
  return null;
}

function parseLedgerSheet(sheet) {
  if (!sheet) return null;

  const rawRows = expandSingleCellDelimitedRows(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }));
  const textRows = expandSingleCellDelimitedRows(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }));
  const headerIndex = textRows.findIndex(isLedgerHeaderRow);
  if (headerIndex < 0) return null;

  const headers = textRows[headerIndex].map(normalizeHeader);
  const indexOf = (...names) => headers.findIndex((header) => names.some((name) => header.includes(name)));
  const idx = {
    date: indexOf("日期"),
    match: indexOf("场次", "比赛", "对阵"),
    pick: indexOf("投注内容", "投注项", "投注选择", "投注方向", "玩法"),
    stake: indexOf("投入"),
    profit: indexOf("盈利", "亏损", "利润", "盈亏"),
    returnAmount: indexOf("结余", "返还", "返回"),
    score: headers.findIndex((header) => header.includes("实际比分") || header === "比分" || header.includes("赛果")),
    status: indexOf("状态", "结果"),
    note: indexOf("备注")
  };

  if (idx.date < 0 || idx.stake < 0) return null;

  return rawRows.slice(headerIndex + 1).flatMap((rawRow, offset) => {
    const textRow = textRows[headerIndex + 1 + offset] || [];
    if (!rawRow.some(Boolean) && !textRow.some(Boolean)) return [];
    const date = normalizeDate(cellValue(rawRow, idx.date), cellValue(textRow, idx.date));
    const match = textValue(rawRow, textRow, idx.match);
    const stake = toNumber(cellValue(rawRow, idx.stake));
    const rawReturnAmount = cellValue(rawRow, idx.returnAmount);
    const importedStatus = normalizeStatus(textValue(rawRow, textRow, idx.status));
    const importedUnsettled = importedStatus === "未结算";
    const hasReturnAmount = !importedUnsettled && hasFilledAmount(rawReturnAmount);
    const returnAmount = hasReturnAmount ? toNumber(rawReturnAmount) : 0;
    const rawProfit = cellValue(rawRow, idx.profit);
    const profit = hasReturnAmount ? toNumber(hasFilledAmount(rawProfit) ? rawProfit : returnAmount - stake) : 0;
    const note = textValue(rawRow, textRow, idx.note);
    if (!date || !match) return [];

    return {
      date,
      match,
      pick: textValue(rawRow, textRow, idx.pick),
      stake,
      returnAmount,
      hasReturnAmount,
      profit,
      score: textValue(rawRow, textRow, idx.score),
      note,
      status: importedUnsettled ? "未结算" : inferStatus({ profit, stake, returnAmount, hasReturnAmount })
    };
  });
}

function prioritizeSheetNames(sheetNames) {
  const preferred = ["投注明细", "投注记录"];
  return [
    ...preferred.filter((name) => sheetNames.includes(name)),
    ...sheetNames.filter((name) => !preferred.includes(name))
  ];
}

function isLedgerHeaderRow(row) {
  const headers = row.map(normalizeHeader);
  const hasDate = headers.some((header) => header.includes("日期") || header.includes("时间"));
  const hasStake = headers.some((header) => header.includes("投入") || header.includes("金额") || header.includes("本金"));
  return hasDate && hasStake;
}

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function expandSingleCellDelimitedRows(rows) {
  return rows.map((row) => {
    if (row.length !== 1 || typeof row[0] !== "string") return row;
    const delimiter = detectDelimiter(row[0]);
    return delimiter ? parseDelimitedLine(row[0], delimiter) : row;
  });
}

function detectDelimiter(text) {
  const candidates = [";", "\t", ","];
  return candidates.find((delimiter) => text.includes(delimiter)) || "";
}

function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += char;
  }

  cells.push(cell.trim());
  return cells;
}

function normalizeDate(value, displayValue = value) {
  const parsedText = parseDateText(displayValue);
  if (parsedText) return parsedText;

  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return formatDateParts(parsed.y, parsed.m, parsed.d);
    }
  }

  const text = parseDateText(value);
  return text || "";
}

function parseDateText(value) {
  const text = String(value || "").trim().replace(/\//g, "-");
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return formatDateParts(match[1], match[2], match[3]);

  const monthFirstMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (!monthFirstMatch) return "";
  return formatDateParts(normalizeYear(monthFirstMatch[3]), monthFirstMatch[1], monthFirstMatch[2]);
}

function normalizeYear(value) {
  const year = Number(value);
  if (!Number.isFinite(year)) return value;
  return year < 100 ? 2000 + year : year;
}

function formatDateParts(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const n = Number(String(value).replace(/[¥,\s]/g, ""));
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function hasFilledAmount(value) {
  return value !== "" && value !== null && value !== undefined && String(value).trim() !== "";
}

function normalizeStatus(value) {
  const text = String(value ?? "").trim();
  return ["命中", "亏损", "走水", "未结算"].includes(text) ? text : "";
}

function cellValue(row, index) {
  return index >= 0 ? row[index] : "";
}

function textValue(rawRow, textRow, index) {
  if (index < 0) return "";
  return normalizeTextCell(rawRow[index], textRow[index]);
}

function normalizeTextCell(rawValue, textValue) {
  if (rawValue instanceof Date && !Number.isNaN(rawValue.valueOf())) {
    return accidentalDateText(rawValue);
  }
  if (textValue instanceof Date && !Number.isNaN(textValue.valueOf())) {
    return accidentalDateText(textValue);
  }
  return String(textValue ?? rawValue ?? "").trim();
}

function accidentalDateText(date) {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return `${month}-${day}`;
}
