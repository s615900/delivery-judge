// GET /api/report：報表網頁（判斷總覽、每日實際、優化建議與確認按鈕）
//
//   ?format=json   回 JSON；預設回網頁
//   ?token=金鑰    用瀏覽器開時帶金鑰（也可用 x-judge-token 標頭）

import { checkToken } from '../lib/http.js';
import { storeEnabled, fetchRecords, fetchDailies, getTuning } from '../lib/store.js';
import { summarize } from '../lib/analyze.js';
import { analyzeDay, dayRange } from '../lib/tune.js';
import { renderReport } from '../lib/report-html.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!checkToken(req, res, { allowQuery: true })) return;
  if (!storeEnabled()) return res.status(503).json({ speak: '還沒設定資料庫', error: 'no_db' });

  try {
    const dailies = await fetchDailies(14);
    const days = [];
    for (const d of dailies) {
      const [from, to] = dayRange(d._id);
      days.push(analyzeDay({ date: d._id, trips: d.trips, pay: d.pay, hours: d.hours }, await fetchRecords(from, to)));
    }
    const since = new Date(Date.now() - 30 * 86400000);
    const stats = summarize(await fetchRecords(since, new Date(Date.now() + 60000)));
    const tuning = await getTuning();

    res.setHeader('Cache-Control', 'no-store');
    if (req.query?.format === 'json') return res.status(200).json({ stats, days, tuning });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(renderReport({ stats, days, tuning }));
  } catch (err) {
    console.error('report failed:', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
}
