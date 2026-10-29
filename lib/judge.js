import { CONFIG } from './config.js';
import { parseOffer } from './parse.js';
import { lookupZone, zoneName } from './zones.js';

const round = (n) => Math.round(n);

/**
 * 計算一張派單的實際時薪與判斷。
 * @param {object} offer parseOffer() 的結果
 * @param {object} [opts] 覆蓋 CONFIG 的設定，例如 { targetHourly: 250 }
 */
export function judgeOffer(offer, opts = {}) {
  const c = { ...CONFIG, ...opts };
  const { amount, minutes, km, orders, type } = offer;

  if (minutes === null) {
    return {
      verdict: 'unknown',
      speak: '讀不到時間，請自己看',
      offer,
    };
  }

  // 1. 保底金額：分鐘 × 245 ÷ 60
  const perOrderFloor = (minutes * c.hourlyFloor) / 60;
  const floorMultiplier = type === 'stack' ? Math.max(1, Math.min(orders, c.stackFloorMultiplier)) : 1;
  const floor = Math.max(perOrderFloor * floorMultiplier, c.minPerOrder * (type === 'stack' ? orders : 1));

  // 2. 實際拿到 = 畫面金額 + 保底補差 × 實領比例（比例 1 等於「畫面金額和保底取高」）
  const floorGap = Math.max(0, floor - (amount ?? 0));
  const pay = (amount ?? 0) + floorGap * c.topUpScale;

  // 3. 扣成本
  const cost = (km ?? 0) * c.costPerKm;
  const net = pay - cost;

  // 4. 落點空車時間
  const zone = lookupZone(offer.dropoffText);
  const emptyBase = zone?.empty ?? c.unknownEmptyMinutes;
  const empty = emptyBase * c.emptyScale;

  // 5. 實際時薪
  const hourly = (net / (minutes + empty)) * 60;

  let verdict;
  if (hourly >= c.targetHourly) verdict = 'take';
  else if (hourly >= c.targetHourly * c.maybeRatio) verdict = 'maybe';
  else verdict = 'skip';

  const verdictWord = { take: '接', maybe: '看情況', skip: '不接' }[verdict];
  const typeWord = { single: '', stack: `疊${orders}單，`, addon: '夾單，' }[type];
  const place = zone ? zone.label : '落點不明';
  const emptyNote = zone && (zone.zone === 'cold' || zone.zone === 'cross') ? `，回程${empty}分` : '';
  const amountNote = amount === null ? '，讀不到金額，用保底算' : '';

  const toppedUp = amount !== null && floor > amount;
  const payNote = `實領${round(pay)}${toppedUp ? '，保底補' + round(pay - amount) : ''}，扣成本剩${round(net)}`;

  const speak = `${verdictWord}，${typeWord}${payNote}，時薪${round(hourly)}，${place}${emptyNote}${amountNote}`;

  return {
    verdict,
    speak,
    hourly: round(hourly),
    pay: round(pay),
    floor: round(floor),
    toppedUp,
    net: round(net),
    cost: round(cost),
    emptyMinutes: empty,
    emptyBase,
    floorGap: round(floorGap),
    zone: zone ? { key: zone.key, zone: zone.zone, zoneName: zoneName(zone.zone), label: zone.label } : null,
    offer,
  };
}

/** 從 OCR 文字一路算到判斷 */
export function judgeText(text, opts = {}) {
  const offer = parseOffer(text);
  if (offer.amount === null && offer.minutes === null) {
    return { verdict: 'unknown', speak: '讀不到派單畫面', offer };
  }
  return judgeOffer(offer, opts);
}
