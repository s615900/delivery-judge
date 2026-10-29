// 資料存取（MongoDB）。沒設 MONGODB_URI 時全部略過，判斷照常運作，只是不記錄、不學習。
//
// judgements  每次判斷（解析後的數字＋原始 OCR 文字截斷）；不存截圖
// dailies     每日實際（趟數、金額、上線時數），一天一筆
// settings    id=tuning：目前生效的倍率、待確認的建議、調整紀錄

import { CONFIG } from './config.js';

const DB_NAME = process.env.MONGODB_DB || 'delivery_judge';
const TIMEOUT_MS = 3000;

export const storeEnabled = () => Boolean(process.env.MONGODB_URI);

let clientPromise = null;
async function col(name) {
  if (!clientPromise) {
    const { MongoClient } = await import('mongodb');
    clientPromise = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: TIMEOUT_MS }).connect();
    clientPromise.catch(() => { clientPromise = null; });
  }
  return (await clientPromise).db(DB_NAME).collection(name);
}

// 資料庫慢或掛掉時，不能拖住語音回應
const withTimeout = (p) => Promise.race([
  p, new Promise((_, reject) => setTimeout(() => reject(new Error('db_timeout')), TIMEOUT_MS)),
]);

const DEFAULT_ACTIVE = { emptyScale: CONFIG.emptyScale, topUpScale: CONFIG.topUpScale };

// ── 判斷紀錄 ──
export async function insertRecord(doc) {
  if (!storeEnabled()) return null;
  try {
    const c = await withTimeout(col('judgements'));
    return String((await withTimeout(c.insertOne(doc))).insertedId);
  } catch (err) {
    console.error('insertRecord failed:', err.message);
    return null;
  }
}

export async function fetchRecords(from, to, limit = 5000) {
  const c = await withTimeout(col('judgements'));
  return withTimeout(c.find({ ts: { $gte: from, $lt: to } }).sort({ ts: 1 }).limit(limit).toArray());
}

// ── 每日實際 ──
export async function saveDaily(day) {
  const c = await withTimeout(col('dailies'));
  await withTimeout(c.updateOne({ _id: day.date }, { $set: { ...day, updatedAt: new Date() } }, { upsert: true }));
}

export async function fetchDailies(limit = 14) {
  const c = await withTimeout(col('dailies'));
  return (await withTimeout(c.find({}).sort({ _id: -1 }).limit(limit).toArray())).reverse();
}

// ── 設定 ──
let activeCache = null; // { at, value }：判斷時 60 秒內不重複查資料庫
export function clearActiveCache() { activeCache = null; }

export async function getTuning() {
  const c = await withTimeout(col('settings'));
  const doc = await withTimeout(c.findOne({ _id: 'tuning' }));
  return {
    active: { ...DEFAULT_ACTIVE, ...(doc?.active ?? {}) },
    pending: doc?.pending ?? null,
    lastNote: doc?.lastNote ?? null,
    history: doc?.history ?? [],
  };
}

/** 判斷時用：目前生效的倍率。查不到就用預設，不能影響判斷。 */
export async function getActive() {
  if (!storeEnabled()) return DEFAULT_ACTIVE;
  if (activeCache && Date.now() - activeCache.at < 60000) return activeCache.value;
  try {
    const { active } = await getTuning();
    activeCache = { at: Date.now(), value: active };
    return active;
  } catch (err) {
    console.error('getActive failed:', err.message);
    return DEFAULT_ACTIVE;
  }
}

export async function setPending({ pending, lastNote }) {
  const c = await withTimeout(col('settings'));
  await withTimeout(c.updateOne({ _id: 'tuning' }, { $set: { pending, lastNote } }, { upsert: true }));
}

/** @param {'apply'|'reject'|'revert'} action */
export async function resolvePending(action) {
  const t = await getTuning();
  const c = await withTimeout(col('settings'));
  const keep = (h) => h.slice(-50);
  const set = (fields) => withTimeout(c.updateOne({ _id: 'tuning' }, { $set: fields }, { upsert: true }));

  if (action === 'apply') {
    if (!t.pending) return { ok: false, reason: 'no_pending' };
    const to = { ...t.active, ...t.pending.values };
    const entry = { at: new Date(), from: t.active, to, changes: t.pending.changes };
    await set({ active: to, pending: null, history: keep([...t.history, entry]) });
  } else if (action === 'reject') {
    await set({ pending: null });
  } else if (action === 'revert') {
    const last = t.history.at(-1);
    if (!last) return { ok: false, reason: 'no_history' };
    const entry = { at: new Date(), from: t.active, to: last.from, changes: [{ key: 'revert', why: '還原上一次調整' }] };
    await set({ active: last.from, history: keep([...t.history, entry]) });
  } else {
    return { ok: false, reason: 'bad_action' };
  }

  clearActiveCache();
  return { ok: true, tuning: await getTuning() };
}
