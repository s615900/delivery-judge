// 解析每日收入畫面（總趟數、總金額、上線時數）。
//
// ⚠️ 畫面格式是假設的，還沒用真實截圖驗證。拿到真實樣本後改下面的正規表示式。
// 也可以在請求裡直接帶 trips / pay / hours 數字，會優先使用。

function normalize(raw) {
  return String(raw ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[＄]/g, '$').replace(/[．]/g, '.').replace(/[：]/g, ':')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/\r/g, '');
}

const RE = {
  trips: /(\d+)\s*(?:趟|筆|單|次)/g,
  money: /(?:NT\s*\$|\$)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*元/g,
  hm: /(\d+(?:\.\d+)?)\s*(?:小時|時|hrs?|h)\s*(?:(\d+)\s*(?:分鐘|分|min|m))?/i,
  clock: /(\d{1,2}):(\d{2})/,
  minOnly: /(\d+)\s*(?:分鐘|分|min)/i,
};

const nums = (re, text, pick) => {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) out.push(parseFloat(pick(m)));
  return out.filter((v) => Number.isFinite(v));
};

function parseHours(text) {
  const hm = text.match(RE.hm);
  if (hm) return parseFloat(hm[1]) + (hm[2] ? parseInt(hm[2], 10) / 60 : 0);
  const clock = text.match(RE.clock);
  if (clock) return parseInt(clock[1], 10) + parseInt(clock[2], 10) / 60;
  const mo = text.match(RE.minOnly);
  if (mo) return parseInt(mo[1], 10) / 60;
  return null;
}

const positive = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

/**
 * @param {string} raw OCR 文字
 * @param {{trips?:number, pay?:number, hours?:number}} [override] 手動輸入的數字
 * @returns {{trips:number|null, pay:number|null, hours:number|null, missing:string[]}}
 */
export function parseDaily(raw, override = {}) {
  const text = normalize(raw);

  const trips = positive(override.trips)
    ?? (nums(RE.trips, text, (m) => m[1]).filter((v) => v > 0 && v < 200).sort((a, b) => b - a)[0] ?? null);
  const pay = positive(override.pay)
    ?? (nums(RE.money, text, (m) => m[1] ?? m[2]).filter((v) => v >= 50 && v < 30000).sort((a, b) => b - a)[0] ?? null);
  const hours = positive(override.hours) ?? parseHours(text);

  const missing = [];
  if (!trips) missing.push('趟數');
  if (!pay) missing.push('金額');
  if (!hours) missing.push('上線時數');
  return { trips, pay, hours: hours ? Math.round(hours * 100) / 100 : null, missing };
}
