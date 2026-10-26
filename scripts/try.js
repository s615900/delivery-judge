// 本機試算：npm run try -- "NT$60 預估 15 分鐘 送達 三重區正義北路"
// 或：pbpaste | npm run try
import { judgeText } from '../lib/judge.js';

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

const text = process.argv.slice(2).join(' ') || (await readStdin());
if (!text.trim()) {
  console.log('用法：npm run try -- "派單文字"');
  process.exit(1);
}
console.log(JSON.stringify(judgeText(text), null, 2));
