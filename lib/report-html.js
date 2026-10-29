// 把報表資料排成手機看得懂的網頁
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NAMES = { emptyScale: '空車時間倍率', topUpScale: '保底補差實領比例', revert: '還原' };
const fmtDate = (d) => new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });

export function renderReport({ stats, days, tuning }) {
  const { active, pending, lastNote, history } = tuning;
  const v = stats.verdicts;

  const pendingHtml = pending
    ? `<ul>${pending.changes.map((c) => `<li><b>${NAMES[c.key] ?? c.key}</b>：${c.from} → <b>${c.to}</b><br><span class="muted">${esc(c.why)}</span></li>`).join('')}</ul>
       <button onclick="act('apply')">套用</button> <button class="ghost" onclick="act('reject')">不採用</button>`
    : `<p>目前沒有待確認的建議。</p><p class="muted">${esc(lastNote?.note ?? '還沒送過每日資料')}</p>`;

  const dayRows = days.length
    ? [...days].reverse().map((d) => `<tr><td>${esc(d.date.slice(5))}</td><td>${d.trips}</td><td>${Math.round(d.pay)}</td><td>${d.hours}</td><td>${Math.round(d.hourlyGross)}</td><td>${d.ok ? Math.round(d.hourlyNet) : '—'}</td><td>${d.ok ? '✓' : `<span class="muted">${esc(d.reason)}</span>`}</td></tr>`).join('')
    : '<tr><td colspan="7">還沒有每日資料</td></tr>';

  const histRows = history.length
    ? [...history].reverse().slice(0, 8).map((h) => `<li>${fmtDate(h.at)}：${h.changes.map((c) => esc(NAMES[c.key] ?? c.key)).join('、')}（空車 ${h.to.emptyScale}、補差 ${h.to.topUpScale}）</li>`).join('')
    : '<li>還沒有調整過</li>';

  const hints = stats.hints.map((h) => `<li>${esc(h)}</li>`).join('');
  const unknown = stats.unknownDrops.length ? stats.unknownDrops.map((s) => `<li>${esc(s)}</li>`).join('') : '<li>無</li>';

  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>派單判斷報表</title>
<style>
body{font-family:-apple-system,"PingFang TC",sans-serif;margin:0;padding:16px;background:#f5f5f7;color:#1d1d1f;line-height:1.5}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:20px 0 8px}
.card{background:#fff;border-radius:12px;padding:12px 16px;margin-bottom:12px;overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #eee}
li{margin-bottom:6px}.sug{background:#fff8e1}.muted{color:#6e6e73;font-size:13px}
button{font-size:16px;padding:10px 18px;border:0;border-radius:10px;background:#0071e3;color:#fff}
button.ghost{background:#e5e5ea;color:#1d1d1f}
</style></head><body>
<h1>派單判斷報表</h1>
<h2>待確認的優化建議</h2>
<div class="card sug">${pendingHtml}</div>
<h2>目前生效的設定</h2>
<div class="card">空車時間倍率 <b>${active.emptyScale}</b>　保底補差實領比例 <b>${active.topUpScale}</b>
<p class="muted">1 代表照 zones.js 與保底公式原樣計算。</p>
<button class="ghost" onclick="act('revert')">還原上一次調整</button></div>
<h2>每日實際</h2>
<div class="card"><table><tr><th>日期</th><th>趟數</th><th>金額</th><th>時數</th><th>時薪</th><th>淨時薪</th><th>優化</th></tr>${dayRows}</table>
<p class="muted">淨時薪 = 扣掉預估油錢耗損。「優化」欄打勾代表當天有足夠的判斷紀錄，列入計算。</p></div>
<h2>最近 30 天判斷</h2>
<div class="card">共 ${stats.total} 筆：接 ${v.take}、看情況 ${v.maybe}、不接 ${v.skip}、讀不到 ${v.unknown}<br>
讀不到金額或時間的比例：${stats.parseWarnRate ?? '—'}%
${hints ? `<ul>${hints}</ul>` : ''}</div>
<h2>沒對到的落點</h2><div class="card"><ul>${unknown}</ul></div>
<h2>調整紀錄</h2><div class="card"><ul>${histRows}</ul></div>
<script>
async function act(action){
  const q=location.search.match(/token=([^&]+)/);
  const r=await fetch('/api/apply'+(q?'?token='+q[1]:''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});
  if(r.ok)location.reload();else alert('操作失敗：'+r.status);
}
</script></body></html>`;
}
