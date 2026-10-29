// 測試用的派單文字都是假設格式，拿到真實截圖後要換成真的 OCR 結果。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOffer } from '../lib/parse.js';
import { judgeText } from '../lib/judge.js';
import { lookupZone } from '../lib/zones.js';
import handler from '../api/judge.js';

const SINGLE_HOT = `Uber Eats
NT$45.00
預估 14 分鐘（2.1 公里）總計
取餐
蘆洲區長安街
送達
三重區正義北路`;

const SINGLE_COLD = `NT$85
預估 22 分鐘 6.8 公里
取餐 三重區重新路三段
送達 五股區五工路`;

const CROSS = `$95.0
20 分鐘 · 4.2 km
取餐：三重區三和路四段
送達：台北市大同區延平北路二段`;

const STACK = `2 筆訂單
NT$110
預估 25 分鐘（3.0 公里）
取餐 蘆洲區中正路
送達 蘆洲區三民路
送達 蘆洲區長榮路`;

const ADDON = `加入目前行程
NT$29
新增 7 分鐘 0.8 公里
送達 三重區自強路`;

test('解析單張單', () => {
  const o = parseOffer(SINGLE_HOT);
  assert.equal(o.amount, 45);
  assert.equal(o.minutes, 14);
  assert.equal(o.km, 2.1);
  assert.equal(o.type, 'single');
});

test('全形數字也讀得到', () => {
  const o = parseOffer('ＮＴ＄６０\n預估１５分鐘\n送達 三重區');
  assert.equal(o.amount, 60);
  assert.equal(o.minutes, 15);
});

test('落點取送達地點，不是取餐地點', () => {
  const o = parseOffer(SINGLE_COLD);
  assert.equal(lookupZone(o.dropoffText).label, '五股工業區');
});

test('路名優先於行政區', () => {
  assert.equal(lookupZone('台北市大同區延平北路').key, '延平北路');
  assert.equal(lookupZone('新北市三重區').key, '三重');
});

test('熱區短單：金額低但保底補足，判斷接', () => {
  const r = judgeText(SINGLE_HOT);
  assert.equal(r.floor, 57);
  assert.equal(r.pay, 57);
  assert.equal(r.toppedUp, true);
  assert.equal(r.verdict, 'take');
  assert.match(r.speak, /^接/);
});

test('五股工業區：回程遠，判斷不接', () => {
  const r = judgeText(SINGLE_COLD);
  assert.equal(r.zone.zone, 'cold');
  assert.equal(r.verdict, 'skip');
  assert.match(r.speak, /回程12分/);
});

test('過橋到台北', () => {
  const r = judgeText(CROSS);
  assert.equal(r.zone.zone, 'cross');
  assert.ok(r.hourly > 0);
});

test('疊單', () => {
  const r = judgeText(STACK);
  assert.equal(r.offer.type, 'stack');
  assert.equal(r.offer.orders, 2);
  assert.match(r.speak, /疊2單/);
  // 保守模式只算一次保底，取畫面金額 110
  assert.equal(r.pay, 110);
});

test('疊單保底倍數調高後，保底變兩倍', () => {
  const r = judgeText(STACK, { stackFloorMultiplier: 2 });
  assert.equal(r.floor, 204);
  assert.equal(r.pay, 204);
});

test('夾單', () => {
  const r = judgeText(ADDON);
  assert.equal(r.offer.type, 'addon');
  assert.equal(r.offer.minutes, 7);
  assert.match(r.speak, /夾單/);
});

test('自訂目標時薪', () => {
  const low = judgeText(SINGLE_HOT, { targetHourly: 150 });
  const high = judgeText(SINGLE_HOT, { targetHourly: 400 });
  assert.equal(low.verdict, 'take');
  assert.equal(high.verdict, 'skip');
});

test('讀不到畫面', () => {
  const r = judgeText('今天天氣很好');
  assert.equal(r.verdict, 'unknown');
});

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}

test('API：正常請求', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: { text: SINGLE_HOT, target: 200 } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.speak, /^接/);
});

test('API：設了金鑰時要驗證', async () => {
  process.env.JUDGE_TOKEN = 'abc';
  const bad = mockRes();
  await handler({ method: 'POST', headers: {}, body: { text: SINGLE_HOT } }, bad);
  assert.equal(bad.statusCode, 401);
  const ok = mockRes();
  await handler({ method: 'POST', headers: { 'x-judge-token': 'abc' }, body: { text: SINGLE_HOT } }, ok);
  assert.equal(ok.statusCode, 200);
  delete process.env.JUDGE_TOKEN;
});

test('API：只接受 POST', async () => {
  const res = mockRes();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 405);
});
