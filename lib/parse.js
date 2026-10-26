// 解析 iPhone「從影像擷取文字」讀出的派單畫面文字。
//
// ⚠️ 目前的格式是假設的，還沒用真實截圖驗證。
// 拿到真實樣本後，主要會改的是下面這幾個正規表示式。

// 全形數字、符號轉半形，OCR 常常混用
function normalize(raw) {
  return String(raw ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[＄]/g, '$')
    .replace(/[．]/g, '.')
    .replace(/[，,](?=\d{3}\b)/g, '') // 1,200 → 1200
    .replace(/\r/g, '');
}

const RE = {
  // NT$85.3 / $85 / 85 元
  amount: /(?:NT\s*\$|\$)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*元/g,
  // 22 分鐘 / 22 分 / 22 min
  minutes: /(\d+)\s*(?:分鐘|分(?!店)|min)/gi,
  // 4.6 公里 / 4.6 km
  km: /(\d+(?:\.\d+)?)\s*(?:公里|km)/gi,
  // 2 筆訂單 / 2 單 / 2 個行程
  orders: /(\d+)\s*(?:筆|個|張)?\s*(?:訂單|行程|單)/,
  // 夾單：畫面通常寫「新增 7 分鐘」「加入目前行程」
  addOn: /新增|加入目前|額外|追加/,
  // 落點關鍵字之後的文字視為送達地點
  dropoff: /(?:送達|外送至|送往|目的地|顧客地址|交付)[:：\s]*/g,
};

function allNumbers(re, text) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const v = parseFloat(m[1] ?? m[2]);
    if (!Number.isNaN(v)) out.push(v);
  }
  return out;
}

function dropoffText(text) {
  let last = -1;
  RE.dropoff.lastIndex = 0;
  let m;
  while ((m = RE.dropoff.exec(text)) !== null) last = m.index + m[0].length;
  if (last !== -1) return text.slice(last);

  // 沒有關鍵字：取後半段（取餐地點通常在前面）
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.slice(Math.floor(lines.length / 2)).join('\n');
}

/**
 * @param {string} raw OCR 文字
 * @returns {{amount:number|null, minutes:number|null, km:number|null,
 *            orders:number, type:'single'|'stack'|'addon',
 *            dropoffText:string, warnings:string[]}}
 */
export function parseOffer(raw) {
  const text = normalize(raw);
  const warnings = [];

  // 金額：畫面上常有好幾個數字，取最大的當總報酬
  const amounts = allNumbers(RE.amount, text).filter((v) => v >= 10 && v < 2000);
  const amount = amounts.length ? Math.max(...amounts) : null;
  if (amount === null) warnings.push('讀不到金額');

  // 時間：取最大的當總預估時間（夾單會讀到「新增 X 分鐘」）
  const mins = allNumbers(RE.minutes, text).filter((v) => v > 0 && v < 180);
  const minutes = mins.length ? Math.max(...mins) : null;
  if (minutes === null) warnings.push('讀不到時間');

  const kms = allNumbers(RE.km, text).filter((v) => v > 0 && v < 60);
  const km = kms.length ? Math.max(...kms) : null;

  const om = text.match(RE.orders);
  const orders = om ? Math.max(1, parseInt(om[1], 10)) : 1;

  let type = 'single';
  if (RE.addOn.test(text)) type = 'addon';
  else if (orders >= 2) type = 'stack';

  return { amount, minutes, km, orders, type, dropoffText: dropoffText(text), warnings };
}
