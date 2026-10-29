// 報表用的統計：判斷總覽、讀取失敗比例、沒對到的落點
export function summarize(records) {
  const total = records.length;
  const verdicts = { take: 0, maybe: 0, skip: 0, unknown: 0 };
  let parseWarn = 0;
  for (const r of records) {
    verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1;
    if (r.warnings?.length) parseWarn += 1;
  }
  const unknownDrops = [...new Set(
    records.filter((r) => !r.zoneKey && r.dropoffText)
      .map((r) => r.dropoffText.replace(/\s+/g, ' ').slice(0, 40)),
  )].slice(-10);

  const hints = [];
  if (total >= 10 && parseWarn / total > 0.2) {
    hints.push(`有 ${Math.round((parseWarn / total) * 100)}% 的畫面讀不到金額或時間，需要用紀錄裡的原始文字修正 lib/parse.js。`);
  }
  if (unknownDrops.length >= 3) hints.push('有落點沒對到路名表，常出現的路名請補進 lib/zones.js。');

  return {
    total, verdicts, unknownDrops, hints,
    parseWarnRate: total ? Math.round((parseWarn / total) * 1000) / 10 : null,
  };
}
