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

  // 2. 實際拿到 = 畫面金額和保底取高
  const pay = Math.max(amount ?? 0, floor);

  // 3. 扣成本
  const cost = (km ?? 0) * c.costPerKm;
  const net = pay - cost;

  // 4. 落點空車時間
  const zone = lookupZone(offer.dropoffText);
  const empty = zone?.empty ?? c.unknownEmptyMinutes;

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

  const speak = `${verdictWord}，${typeWord}時薪${round(hourly)}，${place}${emptyNote}${amountNote}`;

  return {
    verdict,
    speak,
    hourly: round(hourly),
    pay: round(pay),
    floor: round(floor),
    toppedUp: amount !== null && floor > amount,
    cost: round(cost),
    emptyMinutes: empty,
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
