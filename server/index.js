import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendBets,
  createLedger,
  createBet,
  deleteBet,
  deleteLedger,
  ensureLedger,
  getLedger,
  initDatabase,
  listLedgers,
  listBets,
  replaceAllBets,
  updateLedger,
  updateBet
} from "./db.js";
import { summarizeBets } from "./analytics.js";
import { parseLedgerWorkbook } from "./importer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const app = express();
const port = Number(process.env.PORT || 5174);
const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

initDatabase();

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/ledgers", (_req, res, next) => {
  try {
    res.json({ ledgers: listLedgers() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ledgers", (req, res, next) => {
  try {
    res.status(201).json({ ledger: createLedger(req.body) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/ledgers/:id", (req, res, next) => {
  try {
    const ledger = updateLedger(req.params.id, req.body);
    if (!ledger) return res.status(404).json({ error: "账本不存在" });
    res.json({ ledger });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/ledgers/:id", (req, res, next) => {
  try {
    const ledger = deleteLedger(req.params.id, req.query.confirmName);
    if (!ledger) return res.status(404).json({ error: "账本不存在" });
    res.json({ ledger });
  } catch (error) {
    next(error);
  }
});

app.get("/api/bets", (req, res, next) => {
  try {
    res.json({ bets: listBets(req.query) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/bets", (req, res, next) => {
  try {
    res.status(201).json({ bet: createBet(req.body) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/bets/:id", (req, res, next) => {
  try {
    const bet = updateBet(req.params.id, req.body);
    if (!bet) return res.status(404).json({ error: "投注记录不存在" });
    res.json({ bet });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/bets/:id", (req, res, next) => {
  try {
    if (!deleteBet(req.params.id)) return res.status(404).json({ error: "投注记录不存在" });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/analytics", (req, res, next) => {
  try {
    res.json(summarizeBets(listBets(req.query)));
  } catch (error) {
    next(error);
  }
});

app.post("/api/import/excel", upload.single("file"), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "请上传 xlsx/csv 文件" });
    const ledger = resolveImportLedger(req.query);
    const items = parseLedgerWorkbook(req.file.buffer);
    if (req.query.mode === "append") {
      appendBets(items, ledger.id);
    } else {
      replaceAllBets(items, ledger.id);
    }
    res.json({ imported: items.length, ledger, mode: req.query.mode === "append" ? "append" : "replace" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/export.csv", (req, res, next) => {
  try {
    const rows = listBets(req.query);
    const filename = `${sanitizeFilename(resolveExportLedgerName(req.query))}-${todayForFilename()}.csv`;
    const csv = toCsv([
      ["账本", "日期", "场次", "投注内容", "投入", "返还", "利润", "比分", "状态", "备注"],
      ...rows.map((bet) => [
        bet.ledgerName,
        bet.date,
        bet.match,
        bet.pick,
        bet.stake,
        bet.returnAmount,
        bet.profit,
        bet.score,
        bet.status,
        bet.note
      ])
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="lottery-ledger-${todayForFilename()}.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
});

const distDir = path.join(rootDir, "dist");
app.use(express.static(distDir));
app.get(/.*/, (_req, res, next) => {
  if (process.env.NODE_ENV !== "production") return next();
  res.sendFile(path.join(distDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  const status = /必须|不能为空|没有找到|上传|账本|已存在|超过/.test(error.message) ? 400 : 500;
  res.status(status).json({ error: error.message || "服务器错误" });
});

app.listen(port, host, () => {
  console.log(`Ledger API running at http://${host}:${port}`);
});

function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(",")
    )
    .join("\n");
}

function resolveImportLedger(query) {
  const ledgerName = String(query.ledgerName || "").trim();
  if (ledgerName) return ensureLedger(ledgerName);

  const ledger = getLedger(query.ledgerId);
  if (!ledger) throw new Error("请选择要导入的账本");
  return ledger;
}

function resolveExportLedgerName(query) {
  if (!query.ledgerId || query.ledgerId === "all") return "全部账本";
  const ledger = getLedger(query.ledgerId);
  if (!ledger) throw new Error("账本不存在");
  return ledger.name;
}

function sanitizeFilename(name) {
  return String(name || "体彩投注账本").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "体彩投注账本";
}

function todayForFilename() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
