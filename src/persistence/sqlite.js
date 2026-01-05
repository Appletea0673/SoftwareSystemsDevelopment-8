// src/persistence/sqlite.js
"use strict";

const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

// テストや実行環境で差し替えやすいように環境変数を優先
const DB_LOCATION = process.env.SQLITE_DB_LOCATION || "/etc/todos/todo.db";

// この演習では「TODOアイテム」を扱うためのテーブルを1つ用意
const TABLE_NAME = "todos";

let _dbPromise = null;

function toDbBool(value) {
  // boolean / number / string を 0/1 に寄せる（SQLite保存用）
  if (value === true) return 1;
  if (value === false) return 0;

  // number
  if (typeof value === "number") return value ? 1 : 0;

  // string
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1") return 1;
    if (v === "false" || v === "0") return 0;
  }

  // undefined / null は呼び出し側で扱う想定（ここでは 0 扱いにしない）
  return undefined;
}

function fromDbBool(value) {
  // SQLiteから返る 0/1 や true/false を boolean に正規化
  return value === 1 || value === true;
}

function normalizeRow(row) {
  if (!row) return row;
  return {
    id: row.id,
    title: row.title,
    completed: fromDbBool(row.completed),
  };
}

async function init() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = (async () => {
    const db = await open({
      filename: DB_LOCATION,
      driver: sqlite3.Database,
    });

    // 念のため（同時実行時の待ち）
    await db.exec("PRAGMA busy_timeout = 5000;");

    // completed は 0/1 で保存する
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0
      );
    `);

    return db;
  })();

  return _dbPromise;
}

async function getItems() {
  const db = await init();
  const rows = await db.all(
    `SELECT id, title, completed
     FROM ${TABLE_NAME}
     ORDER BY id ASC;`
  );
  return rows.map(normalizeRow);
}

async function addItem(item) {
  const db = await init();

  if (!item || typeof item.title !== "string" || item.title.trim() === "") {
    throw new Error("title is required");
  }

  const completedDb = toDbBool(item.completed);
  const completed = completedDb === undefined ? 0 : completedDb;

  const result = await db.run(
    `INSERT INTO ${TABLE_NAME} (title, completed)
     VALUES (?, ?);`,
    item.title,
    completed
  );

  return {
    id: result.lastID,
    title: item.title,
    completed: fromDbBool(completed),
  };
}

async function updateItem(id, patch) {
  const db = await init();

  // id が未指定・不正なら更新できない
  if (id === undefined || id === null) return false;

  const existing = await db.get(
    `SELECT id, title, completed
     FROM ${TABLE_NAME}
     WHERE id = ?;`,
    id
  );

  if (!existing) return false;

  const nextTitle =
    patch && typeof patch.title === "string" ? patch.title : existing.title;

  const patchCompletedDb = patch ? toDbBool(patch.completed) : undefined;
  const nextCompleted =
    patchCompletedDb === undefined ? existing.completed : patchCompletedDb;

  const result = await db.run(
    `UPDATE ${TABLE_NAME}
     SET title = ?, completed = ?
     WHERE id = ?;`,
    nextTitle,
    nextCompleted,
    id
  );

  return result.changes > 0;
}

async function deleteItem(id) {
  const db = await init();
  const result = await db.run(`DELETE FROM ${TABLE_NAME} WHERE id = ?;`, id);
  return result.changes > 0;
}

module.exports = {
  init,
  getItems,
  addItem,
  updateItem,
  deleteItem,
};
