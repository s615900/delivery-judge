import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDaily } from '../lib/daily.js';
import { analyzeDay, propose, dedupe, taipeiDate, dayRange } from '../lib/tune.js';
import { judgeText } from '../lib/judge.js';
import dailyHandler from '../api/daily.js';
import applyHandler from '../api/apply.js';
import reportHandler from '../api/report.js';

const mockRes = () => {
  const res = { statusCode: 0, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
};

// ── 每日畫面解析 ──
test('每日畫面：趟數、金額、時數', () => {
  const p = parseDaily('今日收入\nNT$1,520\n18 趟\n上線時間 8 小時 30 分鐘');
  assert.deepEqual([p.trips, p.pay, p.hours], [18, 1520, 8.5]);
  assert.equal(p.missing.length, 0);
});

test('每日畫面：全形、冒號時間、小數時數', () => {
  assert.equal(parseDaily('１８趟 ＄１５２０ 上線 8:30').hours, 8.5);
  assert.equal(parseDaily('18 趟 1520 元 8.5 小時').hours, 8.5);
});

test('每日畫面：缺欄位會列出；手動數字優先', () => {
  assert.deepEqual(parseDaily('1520 元').missing, ['趟數', '上線時數']);
  const p = parseDaily('', { trips: 10, pay: 900, hours: 5 });
  assert.deepEqual([p.trips, p.pay, p.hours, p.missing.length], [10, 900, 5, 0]);
});

// ── 台灣日期 ──
test('台灣時間日期與日範圍', () => {
  assert.equal(taipeiDate(new Date('2026-10-28T17:00:00Z')), '2026-10-29');
  const [from, to] = dayRange('2026-10-29');
  assert.equal(from.toISOString(), '2026-10-28T16:00:00.000Z');
  assert.equal(to - from, 86400000);
});

// ── 優化 ──
const rec = (over = {}) => ({
  ts: new Date('2026-10-29T04:00:00Z'), verdict: 'take', hourly: 200, amount: 45, minutes: 15, km: 2,
  emptyBase: 2, floorGap: 0, costPerKm: 1.5, dropoffText: 'x', ...over,
});
const manyRecs = (n, over = {}) => Array.from({ length: n }, (_, i) =>
  rec({ ts: new Date(Date.UTC(2026, 9, 29, 0, i * 10)), dropoffText: `x${i}`, ...over }));

test('同一單 5 分鐘內重複截圖只算一次', () => {
  const a = rec(); const b = rec({ ts: new Date('2026-10-29T04:02:00Z') });
  assert.equal(dedupe([a, b]).length, 1);
});

test('判斷筆數不到趟數七成：當天不列入優化', () => {
  const d = analyzeDay({ date: 'd', trips: 10, pay: 800, hours: 6 }, manyRecs(5));
  assert.equal(d.ok, false);
  assert.match(d.reason, /七成/);
});

test('空車實際比表上久：建議調高 emptyScale，且每次最多動 0.2', () => {
  // 10 趟、行程各 15 分共 150；上線 6 小時=360 → 閒置 210、每趟 21 分；表上每趟 2 分 → 目標被夾到 3，但只動一步
  const days = [1, 2, 3].map((i) => analyzeDay({ date: `d${i}`, trips: 10, pay: 800, hours: 6 }, manyRecs(10)));
  const r = propose(days, { emptyScale: 1, topUpScale: 1 });
  assert.equal(r.proposal.emptyScale, 1.2);
  assert.equal(r.changes[0].key, 'emptyScale');
});

test('預估貼近實際：不建議', () => {
  // 每趟行程 15 + 閒置 2 = 17 分；10 趟 = 170 分 ≈ 2.83 小時
  const days = [1, 2, 3].map((i) => analyzeDay({ date: `d${i}`, trips: 10, pay: 450, hours: 170 / 60 }, manyRecs(10)));
  const r = propose(days, { emptyScale: 1, topUpScale: 1 });
  assert.equal(r.proposal, null);
  assert.match(r.note, /不需要調整/);
});

test('保底補差實際只補到一半：建議調低 topUpScale', () => {
  // 每單畫面 30、保底補差 20（預估實領 50）；10 趟實際只領 400 → 補差 (400-300)/200 = 0.5
  const mk = () => manyRecs(10, { amount: 30, floorGap: 20 });
  const days = [1, 2, 3].map((i) => analyzeDay({ date: `d${i}`, trips: 10, pay: 400, hours: 170 / 60 }, mk()));
  const r = propose(days, { emptyScale: 1, topUpScale: 1 });
  assert.equal(r.proposal.topUpScale, 0.8);
});

test('資料不足不建議', () => {
  const r = propose([analyzeDay({ date: 'a', trips: 10, pay: 800, hours: 6 }, manyRecs(10))], { emptyScale: 1, topUpScale: 1 });
  assert.equal(r.proposal, null);
  assert.match(r.note, /資料還不夠/);
});

// ── 判斷套用倍率 ──
test('判斷：空車倍率與補差比例會影響時薪', () => {
  const t = 'NT$45\n預估 14 分鐘 2 公里\n送達 三重區正義北路';
  const base = judgeText(t);
  const slow = judgeText(t, { emptyScale: 3 });
  const half = judgeText(t, { topUpScale: 0.5 });
  assert.ok(slow.hourly < base.hourly);
  assert.ok(half.pay < base.pay);
  assert.equal(base.emptyBase, 2);
});

// ── API ──
test('API：沒設資料庫時 daily／apply／report 回 503', async () => {
  delete process.env.MONGODB_URI;
  for (const [h, req] of [[dailyHandler, { method: 'POST', body: { trips: 1, pay: 1, hours: 1 } }], [applyHandler, { method: 'POST', body: {} }], [reportHandler, { method: 'GET', query: {} }]]) {
    const res = mockRes();
    await h({ headers: {}, ...req }, res);
    assert.equal(res.statusCode, 503);
  }
});

test('API：daily／apply／report 要驗證金鑰', async () => {
  process.env.JUDGE_TOKEN = 'abc';
  for (const [h, req] of [[dailyHandler, { method: 'POST', body: {} }], [applyHandler, { method: 'POST', body: {} }], [reportHandler, { method: 'GET', query: {} }]]) {
    const res = mockRes();
    await h({ headers: {}, ...req }, res);
    assert.equal(res.statusCode, 401);
  }
  delete process.env.JUDGE_TOKEN;
});
