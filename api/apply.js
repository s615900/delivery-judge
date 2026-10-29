// POST /api/apply：處理待確認的優化建議
//   { "action": "apply" }   套用，之後的判斷改用新倍率
//   { "action": "reject" }  不採用
//   { "action": "revert" }  還原到上一次調整之前
// 報表網頁上的按鈕會呼叫這支；金鑰可放標頭或 ?token=

import { checkToken, readBody } from '../lib/http.js';
import { storeEnabled, resolvePending } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!checkToken(req, res, { allowQuery: true })) return;
  if (!storeEnabled()) return res.status(503).json({ error: 'no_db' });

  try {
    const r = await resolvePending(readBody(req).action);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(r.ok ? 200 : 400).json(r);
  } catch (err) {
    console.error('apply failed:', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
}
