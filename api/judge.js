// Vercel Serverless Function：POST /api/judge
//
// 請求：{ "text": "OCR 文字", "target": 220 }（target 可省略）
// 回應：{ "speak": "接，時薪230，廟口", "verdict": "take", ... }
//
// 設了環境變數 JUDGE_TOKEN 時，請求要帶 header：x-judge-token: <token>
// 不會儲存任何請求內容。

import { judgeText } from '../lib/judge.js';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ speak: '請用 POST', error: 'method_not_allowed' });
  }

  const token = process.env.JUDGE_TOKEN;
  if (token && req.headers['x-judge-token'] !== token) {
    return res.status(401).json({ speak: '金鑰錯誤', error: 'unauthorized' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = { text: body }; }
  }
  const text = body?.text;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ speak: '沒有收到文字', error: 'missing_text' });
  }

  const opts = {};
  const target = Number(body.target);
  if (Number.isFinite(target) && target > 0) opts.targetHourly = target;

  const result = judgeText(text.slice(0, 5000), opts);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(result);
}
