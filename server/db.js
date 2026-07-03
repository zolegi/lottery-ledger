import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.LEDGER_DATA_DIR ? path.resolve(process.env.LEDGER_DATA_DIR) : path.join(__dirname, "data");

export const DEFAULT_LEDGER_NAME = "2026美加墨世界杯";

fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "ledger.sqlite"));

export function initDatabase() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS ledgers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger_id INTEGER,
      date TEXT NOT NULL,
      match TEXT NOT NULL,
      pick TEXT NOT NULL DEFAULT '',
      stake REAL NOT NULL DEFAULT 0,
      return_amount REAL NOT NULL DEFAULT 0,
      profit REAL NOT NULL DEFAULT 0,
      score TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '未结算',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const betCount = db.prepare("SELECT COUNT(*) AS count FROM bets").get().count;
  let defaultLedger = firstLedger();
  if (!defaultLedger && betCount > 0) {
    defaultLedger = ensureLedger(DEFAULT_LEDGER_NAME, "2026 美加墨世界杯投注账本");
  }

  migrateBetsLedgerColumn(defaultLedger?.id);
  normalizeStoredStatuses();

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bets_ledger_date ON bets(ledger_id, date);
    CREATE INDEX IF NOT EXISTS idx_bets_date ON bets(date);
    CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(status);
  `);
}

export function listLedgers() {
  return db
    .prepare(
      `
      SELECT
        l.id,
        l.name,
        l.description,
        l.created_at,
        l.updated_at,
        COUNT(b.id) AS count,
        COALESCE(SUM(b.stake), 0) AS total_stake,
        COALESCE(SUM(b.return_amount), 0) AS total_return,
        COALESCE(SUM(b.profit), 0) AS total_profit
      FROM ledgers l
      LEFT JOIN bets b ON b.ledger_id = l.id
      GROUP BY l.id
      ORDER BY l.created_at ASC, l.id ASC
      `
    )
    .all()
    .map(rowToLedger);
}

export function getLedger(id) {
  const row = db.prepare("SELECT * FROM ledgers WHERE id = ?").get(Number(id));
  return row ? rowToLedger(row) : null;
}

export function ensureLedger(name, description = "") {
  const normalized = normalizeLedgerName(name);
  const existing = db.prepare("SELECT * FROM ledgers WHERE name = ?").get(normalized);
  if (existing) return rowToLedger(existing);
  return createLedger({ name: normalized, description });
}

export function createLedger(input) {
  const name = normalizeLedgerName(input.name);
  const description = String(input.description || "").trim();
  try {
    const result = db
      .prepare("INSERT INTO ledgers (name, description) VALUES (?, ?)")
      .run(name, description);
    return getLedger(result.lastInsertRowid);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      throw new Error("账本名称已存在");
    }
    throw error;
  }
}

export function updateLedger(id, input) {
  const ledger = getLedger(id);
  if (!ledger) return null;
  const name = normalizeLedgerName(input.name);
  const description = String(input.description ?? ledger.description ?? "").trim();
  try {
    db.prepare(
      `
      UPDATE ledgers
      SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    ).run(name, description, ledger.id);
    return getLedger(ledger.id);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      throw new Error("账本名称已存在");
    }
    throw error;
  }
}

export function deleteLedger(id, confirmName) {
  const ledger = getLedger(id);
  if (!ledger) return null;
  if (String(confirmName || "").trim() !== ledger.name) {
    throw new Error("请输入正确的账本名称确认删除");
  }

  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM bets WHERE ledger_id = ?").run(ledger.id);
    db.prepare("DELETE FROM ledgers WHERE id = ?").run(ledger.id);
    db.exec("COMMIT");
    return ledger;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listBets(filters = {}) {
  const where = [];
  const params = [];

  if (filters.ledgerId && filters.ledgerId !== "all") {
    const ledgerId = requireLedgerId(filters.ledgerId);
    where.push("b.ledger_id = ?");
    params.push(ledgerId);
  }
  if (filters.from) {
    where.push("b.date >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("b.date <= ?");
    params.push(filters.to);
  }
  if (filters.status && filters.status !== "全部") {
    where.push("b.status = ?");
    params.push(filters.status);
  }
  if (filters.q) {
    where.push("(b.match LIKE ? OR b.pick LIKE ? OR b.score LIKE ? OR b.note LIKE ? OR l.name LIKE ?)");
    const q = `%${filters.q}%`;
    params.push(q, q, q, q, q);
  }

  const sql = `
    SELECT b.*, l.name AS ledger_name
    FROM bets b
    LEFT JOIN ledgers l ON l.id = b.ledger_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY b.date DESC, b.id DESC
  `;

  return db.prepare(sql).all(...params).map(rowToBet);
}

export function getBet(id) {
  const row = db
    .prepare(
      `
      SELECT b.*, l.name AS ledger_name
      FROM bets b
      LEFT JOIN ledgers l ON l.id = b.ledger_id
      WHERE b.id = ?
      `
    )
    .get(Number(id));
  return row ? rowToBet(row) : null;
}

export function createBet(input) {
  const bet = normalizeBet(input);
  const result = db
    .prepare(
      `INSERT INTO bets (ledger_id, date, match, pick, stake, return_amount, profit, score, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      bet.ledgerId,
      bet.date,
      bet.match,
      bet.pick,
      bet.stake,
      bet.returnAmount,
      bet.profit,
      bet.score,
      bet.note,
      bet.status
    );
  return getBet(result.lastInsertRowid);
}

export function updateBet(id, input) {
  const current = getBet(id);
  if (!current) return null;
  const bet = normalizeBet({ ...input, ledgerId: input.ledgerId ?? input.ledger_id ?? current.ledgerId });
  db.prepare(
    `UPDATE bets
     SET ledger_id = ?, date = ?, match = ?, pick = ?, stake = ?, return_amount = ?, profit = ?, score = ?, note = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    bet.ledgerId,
    bet.date,
    bet.match,
    bet.pick,
    bet.stake,
    bet.returnAmount,
    bet.profit,
    bet.score,
    bet.note,
    bet.status,
    Number(id)
  );
  return getBet(id);
}

export function deleteBet(id) {
  const result = db.prepare("DELETE FROM bets WHERE id = ?").run(Number(id));
  return result.changes > 0;
}

export function replaceAllBets(items, ledgerId) {
  const targetLedgerId = requireLedgerId(ledgerId);
  const insert = db.prepare(
    `INSERT INTO bets (ledger_id, date, match, pick, stake, return_amount, profit, score, note, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM bets WHERE ledger_id = ?").run(targetLedgerId);
    for (const item of items) {
      const bet = normalizeBet({ ...item, ledgerId: targetLedgerId });
      insert.run(
        targetLedgerId,
        bet.date,
        bet.match,
        bet.pick,
        bet.stake,
        bet.returnAmount,
        bet.profit,
        bet.score,
        bet.note,
        bet.status
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function appendBets(items, ledgerId) {
  const targetLedgerId = requireLedgerId(ledgerId);
  return items.map((item) => createBet({ ...item, ledgerId: targetLedgerId }));
}

export function normalizeBet(input) {
  const ledgerId = requireLedgerId(input.ledgerId ?? input.ledger_id);
  const date = String(input.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("日期必须是 YYYY-MM-DD 格式");
  }

  const match = String(input.match || "").trim();
  if (!match) {
    throw new Error("场次不能为空");
  }

  const stake = toNumber(input.stake);
  const returnAmount = toNumber(input.returnAmount ?? input.return_amount);
  const profit = round(returnAmount - stake);
  const note = String(input.note || "").trim();
  const status = inferStatus({ profit, stake, returnAmount });

  return {
    ledgerId,
    date,
    match,
    pick: String(input.pick || "").trim(),
    stake,
    returnAmount,
    profit,
    score: String(input.score || "").trim(),
    note,
    status
  };
}

export function inferStatus({ profit, stake, returnAmount }) {
  if (stake === 0 && returnAmount === 0) return "未结算";
  if (round(profit) === 0) return "走水";
  if (profit > 0) return "命中";
  if (profit < 0) return "亏损";
  return "未结算";
}

function migrateBetsLedgerColumn(defaultLedgerId) {
  const columns = db.prepare("PRAGMA table_info(bets)").all().map((column) => column.name);
  if (!columns.includes("ledger_id")) {
    db.prepare("ALTER TABLE bets ADD COLUMN ledger_id INTEGER").run();
  }
  if (defaultLedgerId) {
    db.prepare("UPDATE bets SET ledger_id = ? WHERE ledger_id IS NULL").run(defaultLedgerId);
  }
}

function normalizeStoredStatuses() {
  db.prepare(
    `
    UPDATE bets
    SET status = CASE
      WHEN stake = 0 AND return_amount = 0 THEN '未结算'
      WHEN ROUND(return_amount - stake, 2) = 0 THEN '走水'
      WHEN return_amount > stake THEN '命中'
      ELSE '亏损'
    END,
    profit = ROUND(return_amount - stake, 2)
    `
  ).run();
}

function firstLedger() {
  const row = db.prepare("SELECT * FROM ledgers ORDER BY id ASC LIMIT 1").get();
  return row ? rowToLedger(row) : null;
}

function requireLedgerId(value) {
  if (value === undefined || value === null || value === "") {
    throw new Error("请选择账本");
  }
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0 || !getLedger(id)) {
    throw new Error("账本不存在");
  }
  return id;
}

function normalizeLedgerName(name) {
  const normalized = String(name || "").trim();
  if (!normalized) throw new Error("账本名称不能为空");
  if (normalized.length > 40) throw new Error("账本名称不能超过 40 个字");
  return normalized;
}

function toNumber(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("金额必须是非负数字");
  }
  return round(n);
}

function rowToLedger(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    count: Number(row.count || 0),
    totalStake: round(row.total_stake),
    totalReturn: round(row.total_return),
    totalProfit: round(row.total_profit),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToBet(row) {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    ledgerName: row.ledger_name || "",
    date: row.date,
    match: row.match,
    pick: row.pick,
    stake: row.stake,
    returnAmount: row.return_amount,
    profit: row.profit,
    score: row.score,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function round(value) {
  return Number(Number(value || 0).toFixed(2));
}
