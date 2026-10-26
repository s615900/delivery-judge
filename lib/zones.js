// 三重蘆洲落點分級表（初版，依一般經驗估計，請依自己跑單經驗修改）
//
// zone:  hot 熱區 / normal 普通 / cross 過橋到台北 / cold 小心
// empty: 送達後到接到下一單，預估空車分鐘數
// label: 語音唸出的短名稱
//
// 比對規則：路名優先於行政區；同類型時較長的關鍵字優先。

export const ROADS = {
  // ── 蘆洲 熱區 ──
  '長安街': { zone: 'hot', empty: 1, label: '廟口' },
  '中正路': { zone: 'hot', empty: 2, label: '蘆洲中正路' },
  '三民路': { zone: 'hot', empty: 2, label: '三民路' },
  '長榮路': { zone: 'hot', empty: 2, label: '長榮路' },
  '中山一路': { zone: 'hot', empty: 2, label: '中山一路' },
  '民族路': { zone: 'hot', empty: 2, label: '民族路' },
  '光榮路': { zone: 'hot', empty: 3, label: '光榮路' },

  // ── 三重 熱區 ──
  '正義北路': { zone: 'hot', empty: 2, label: '正義北路' },
  '正義南路': { zone: 'hot', empty: 2, label: '正義南路' },
  '重新路': { zone: 'hot', empty: 2, label: '重新路' },
  '三和路': { zone: 'hot', empty: 2, label: '三和路' },
  '中山路': { zone: 'hot', empty: 2, label: '三重中山路' },
  '自強路': { zone: 'hot', empty: 3, label: '自強路' },
  '龍門路': { zone: 'hot', empty: 3, label: '龍門路' },
  '大同南路': { zone: 'hot', empty: 3, label: '大同南路' },
  '大同北路': { zone: 'hot', empty: 3, label: '大同北路' },
  '中正北路': { zone: 'hot', empty: 3, label: '中正北路' },
  '仁愛街': { zone: 'hot', empty: 2, label: '仁愛街' },

  // ── 普通 ──
  '集賢路': { zone: 'normal', empty: 6, label: '集賢路' },
  '復興路': { zone: 'normal', empty: 5, label: '復興路' },
  '光復路': { zone: 'normal', empty: 6, label: '光復路' },
  '中華路': { zone: 'normal', empty: 5, label: '中華路' },
  '成功路': { zone: 'normal', empty: 5, label: '成功路' },
  '重陽路': { zone: 'normal', empty: 5, label: '重陽路' },
  '二重': { zone: 'normal', empty: 7, label: '二重' },
  '環河南路': { zone: 'normal', empty: 7, label: '環河南路' },
  '環河北路': { zone: 'normal', empty: 7, label: '環河北路' },
  '水湳': { zone: 'normal', empty: 7, label: '水湳' },

  // ── 過橋到台北（大同區一帶）──
  '延平北路': { zone: 'cross', empty: 7, label: '延平北路' },
  '迪化街': { zone: 'cross', empty: 7, label: '迪化街' },
  '民權西路': { zone: 'cross', empty: 7, label: '民權西路' },
  '重慶北路': { zone: 'cross', empty: 7, label: '重慶北路' },
  '承德路': { zone: 'cross', empty: 8, label: '承德路' },
  '民生西路': { zone: 'cross', empty: 7, label: '民生西路' },

  // ── 小心（回程遠）──
  '五工路': { zone: 'cold', empty: 12, label: '五股工業區' },
  '五權路': { zone: 'cold', empty: 12, label: '五股工業區' },
  '新五路': { zone: 'cold', empty: 12, label: '五股' },
  '成泰路': { zone: 'cold', empty: 13, label: '成泰路' },
  '中興路': { zone: 'cold', empty: 12, label: '五股中興路' },
  '觀音山': { zone: 'cold', empty: 18, label: '觀音山' },
  '凌雲路': { zone: 'cold', empty: 18, label: '觀音山' },
};

// 路名對不到時，用行政區退而求其次
export const DISTRICTS = {
  '蘆洲': { zone: 'hot', empty: 3, label: '蘆洲' },
  '三重': { zone: 'hot', empty: 3, label: '三重' },
  '新莊': { zone: 'normal', empty: 7, label: '新莊' },
  '大同區': { zone: 'cross', empty: 7, label: '大同區' },
  '中山區': { zone: 'cross', empty: 8, label: '中山區' },
  '士林': { zone: 'cross', empty: 10, label: '士林' },
  '五股': { zone: 'cold', empty: 12, label: '五股' },
  '泰山': { zone: 'cold', empty: 14, label: '泰山' },
  '八里': { zone: 'cold', empty: 18, label: '八里' },
};

const ZONE_NAMES = { hot: '熱區', normal: '普通', cross: '過橋', cold: '偏遠' };

export function zoneName(zone) {
  return ZONE_NAMES[zone] ?? '未知';
}

function longestMatch(text, table) {
  let best = null;
  for (const key of Object.keys(table)) {
    const idx = text.lastIndexOf(key);
    if (idx === -1) continue;
    if (!best || key.length > best.key.length ||
        (key.length === best.key.length && idx > best.idx)) {
      best = { key, idx, ...table[key] };
    }
  }
  return best;
}

/**
 * 在落點文字裡找分級。路名優先，找不到再看行政區。
 * @param {string} text 落點那一段文字（或整段 OCR 文字）
 */
export function lookupZone(text) {
  if (!text) return null;
  return longestMatch(text, ROADS) ?? longestMatch(text, DISTRICTS);
}
