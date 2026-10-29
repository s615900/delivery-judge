// Vercel Serverless Function：POST /api/judge
//
// 請求：{ "text": "OCR 文字", "target": 220 }（target 可省略）
// 回應：{ "speak": "接，時薪230，廟口", "verdict": "take", ... }
//
// 設了 JUDGE_TOKEN 時，請求要帶 header：x-judge-token: <token>
// 設了 MONGODB_URI 時：每次判斷會記錄解析後的數字（不存截圖），
// 並使用資料庫裡「已確認」的空車倍率與保底實領比例。

import { judgeText } from '../lib/judge.js';
import { CONFIG } from '../lib/config.js';
import { checkToken, readBody } from '../lib/http.js';
import { insertRecord, getActive } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ speak: '請用 POST', error: 'method_not_allowed' });
  }
  if (!checkToken(req, res)) return;

  const body = readBody(req);
  const text = body.text;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ speak: '沒有收到文字', error: 'missing_text' });
  }

  const opts = { ...(await getActive()) };
  const target = Number(body.target);
  if (Number.isFinite(target) && target > 0) opts.targetHourly = target;

  const clipped = text.slice(0, 5000);
  const result = judgeText(clipped, opts);

  const offer = result.offer ?? {};
  await insertRecord({
    ts: new Date(),
    text: clipped.slice(0, 2000),
    amount: offer.amount ?? null,
    minutes: offer.minutes ?? null,
    km: offer.km ?? null,
    orders: offer.orders ?? 1,
    type: offer.type ?? 'single',
    dropoffText: (offer.dropoffText ?? '').slice(0, 200),
    warnings: offer.warnings ?? [],
    verdict: result.verdict,
    hourly: result.hourly ?? null,
    pay: result.pay ?? null,
    floor: result.floor ?? null,
    floorGap: result.floorGap ?? 0,
    net: result.net ?? null,
    emptyMinutes: result.emptyMinutes ?? null,
    emptyBase: result.emptyBase ?? null,
    zoneKey: result.zone?.key ?? null,
    scales: { emptyScale: opts.emptyScale, topUpScale: opts.topUpScale },
    target: opts.targetHourly ?? CONFIG.targetHourly,
    costPerKm: CONFIG.costPerKm,
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(result);
}
