// POST /api/daily：每天送一次當日實際（趟數、金額、上線時數）
//
// 請求：{ "text": "OCR 文字" }
//   或直接帶數字（優先於 OCR）：{ "trips": 18, "pay": 1520, "hours": 8.5 }
//   "date": "2026-10-29" 可省略，預設今天（台灣時間）；同一天再送會覆蓋
//
// 送出後系統會比對當天的判斷紀錄，算出新的優化建議，放在「待確認」，
// 到報表按確認才會套用到之後的判斷。

import { checkToken, readBody } from '../lib/http.js';
import { parseDaily } from '../lib/daily.js';
import { analyzeDay, propose, taipeiDate, dayRange } from '../lib/tune.js';
import { storeEnabled, fetchRecords, saveDaily, fetchDailies, getTuning, setPending } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ speak: '請用 POST', error: 'method_not_allowed' });
  }
  if (!checkToken(req, res)) return;
  if (!storeEnabled()) return res.status(503).json({ speak: '還沒設定資料庫', error: 'no_db' });

  const body = readBody(req);
  const p = parseDaily(body.text ?? '', body);
  if (p.missing.length) {
    return res.status(422).json({ speak: `讀不到${p.missing.join('、')}，請再截一次`, error: 'parse_failed', missing: p.missing });
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '') ? body.date : taipeiDate();

  try {
    await saveDaily({ date, trips: p.trips, pay: p.pay, hours: p.hours, text: String(body.text ?? '').slice(0, 1000) });

    // 重算最近 7 天（含今天）
    const dailies = (await fetchDailies(7));
    const results = [];
    for (const d of dailies) {
      const [from, to] = dayRange(d._id);
      results.push(analyzeDay({ date: d._id, trips: d.trips, pay: d.pay, hours: d.hours }, await fetchRecords(from, to)));
    }
    const { active } = await getTuning();
    const { proposal, changes, note } = propose(results, active);
    await setPending({
      pending: proposal ? { values: proposal, changes, at: new Date() } : null,
      lastNote: { at: new Date(), note },
    });

    const today = results.find((r) => r.date === date);
    const hourly = Math.round(p.pay / p.hours);
    let speak = `今日${p.trips}趟，共${Math.round(p.pay)}元，上線${p.hours}小時，時薪${hourly}。`;
    if (today && !today.ok) speak += '今天的判斷筆數不足，不列入優化。';
    else if (proposal) speak += '有新的優化建議，請到報表確認。';
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ speak, date, ...p, hourly, day: today ?? null, proposal: changes, note });
  } catch (err) {
    console.error('daily failed:', err.message);
    return res.status(500).json({ speak: '記錄失敗', error: 'db_error' });
  }
}
