// 每日優化：用「當天實際趟數、金額、上線時數」對照當天的判斷紀錄，算出兩個倍率的建議。
//   emptyScale  空車時間倍率：實際閒置時間 ÷ 表上預估的空車時間
//   topUpScale  保底補差實領比例：實際入帳 ÷ 預估（扣掉畫面金額本身）
// 只算建議，套用要使用者確認。
import { CONFIG } from './config.js';

export const MIN_DAYS = 3;
export const MIN_TRIPS = 15;
export const MIN_COVERAGE = 0.7; // 判斷紀錄筆數至少要有趟數的七成，否則當天不採用
const MAX_STEP = 0.2; // 每次建議最多動 0.2
const MIN_CHANGE = 0.05; // 變動小於這個就不建議

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (n) => Math.round(n * 100) / 100;

/** 台灣時間的日期字串 YYYY-MM-DD */
export function taipeiDate(now = new Date()) {
  return new Date(+now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 該日（台灣時間）的起訖 */
export function dayRange(date) {
  const from = new Date(`${date}T00:00:00+08:00`);
  return [from, new Date(+from + 86400000)];
}

// 同一張單重複截圖（5 分鐘內、內容相同）只算一次
export function dedupe(records) {
  const sorted = [...records].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const kept = [];
  for (const r of sorted) {
    const prev = kept.findLast((k) =>
      k.amount === r.amount && k.minutes === r.minutes && k.km === r.km && k.dropoffText === r.dropoffText);
    if (prev && new Date(r.ts) - new Date(prev.ts) < 5 * 60000) continue;
    kept.push(r);
  }
  return kept;
}

const RANK = { take: 0, maybe: 1, skip: 2, unknown: 3 };

/**
 * 推算當天實際接了哪些單：假設你接最好的 N 單（先接、再看情況、最後不接，同級時薪高的優先）。
 * @param {{date:string, trips:number, pay:number, hours:number}} day
 * @param {object[]} records 當天的判斷紀錄
 */
export function analyzeDay(day, records) {
  const recs = dedupe(records);
  const out = { date: day.date, trips: day.trips, pay: day.pay, hours: day.hours, judged: recs.length, ok: false };
  out.hourlyGross = r2(day.pay / day.hours);

  if (recs.length < day.trips * MIN_COVERAGE) {
    return { ...out, reason: `只有 ${recs.length} 筆判斷，少於 ${day.trips} 趟的七成（可能有單沒用捷徑）` };
  }
  const accepted = [...recs]
    .filter((r) => r.minutes > 0)
    .sort((a, b) => (RANK[a.verdict] - RANK[b.verdict]) || ((b.hourly ?? 0) - (a.hourly ?? 0)))
    .slice(0, day.trips);

  const sum = (f) => accepted.reduce((s, r) => s + (f(r) ?? 0), 0);
  const cost = sum((r) => (r.km ?? 0) * (r.costPerKm ?? CONFIG.costPerKm));
  return {
    ...out,
    ok: true,
    n: accepted.length,
    hourlyNet: r2((day.pay - cost) / day.hours),
    idle: day.hours * 60 - sum((r) => r.minutes), // 上線時間扣掉行程時間 = 閒置
    emptyBaseSum: sum((r) => r.emptyBase ?? r.emptyMinutes),
    amountSum: sum((r) => r.amount),
    topUpSum: sum((r) => r.floorGap),
  };
}

/**
 * @param {object[]} days analyzeDay() 的結果（最近幾天）
 * @param {{emptyScale:number, topUpScale:number}} active 目前生效的倍率
 * @returns {{proposal:object|null, changes:object[], note:string}}
 */
export function propose(days, active) {
  const ok = days.filter((d) => d.ok);
  const trips = ok.reduce((s, d) => s + d.n, 0);
  if (ok.length < MIN_DAYS || trips < MIN_TRIPS) {
    return { proposal: null, changes: [], note: `資料還不夠：目前可用 ${ok.length} 天、${trips} 趟，需要至少 ${MIN_DAYS} 天、${MIN_TRIPS} 趟。` };
  }

  const next = { ...active };
  const changes = [];
  const step = (cur, target) => r2(cur + clamp(target - cur, -MAX_STEP, MAX_STEP));

  // 空車時間
  const idleDays = ok.filter((d) => d.idle > 0 && d.emptyBaseSum > 0);
  const idle = idleDays.reduce((s, d) => s + d.idle, 0);
  const base = idleDays.reduce((s, d) => s + d.emptyBaseSum, 0);
  if (base > 0) {
    const target = clamp(idle / base, 0.5, 3);
    const v = step(active.emptyScale, target);
    if (Math.abs(v - active.emptyScale) >= MIN_CHANGE) {
      next.emptyScale = v;
      changes.push({
        key: 'emptyScale', from: active.emptyScale, to: v,
        why: `實際每趟閒置約 ${r2(idle / idleDays.reduce((s, d) => s + d.n, 0))} 分，表上預估約 ${r2(base / idleDays.reduce((s, d) => s + d.n, 0))} 分（倍率算出約 ${r2(target)}）`,
      });
    }
  }

  // 保底補差
  const topUp = ok.reduce((s, d) => s + d.topUpSum, 0);
  const pay = ok.reduce((s, d) => s + d.pay, 0);
  const amount = ok.reduce((s, d) => s + d.amountSum, 0);
  if (topUp >= pay * 0.1) {
    const target = clamp((pay - amount) / topUp, 0, 1.5);
    const v = step(active.topUpScale, target);
    if (Math.abs(v - active.topUpScale) >= MIN_CHANGE) {
      next.topUpScale = v;
      changes.push({
        key: 'topUpScale', from: active.topUpScale, to: v,
        why: `實際入帳 ${Math.round(pay)} 元，畫面金額合計 ${Math.round(amount)} 元，保底補差預估 ${Math.round(topUp)} 元，實際只補到約 ${r2(target)} 成`,
      });
    }
  }

  if (!changes.length) return { proposal: null, changes, note: '預估和實際接近，目前不需要調整。' };
  return { proposal: next, changes, note: `依 ${ok.length} 天、${trips} 趟算出的建議。` };
}
