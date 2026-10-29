// API 共用：金鑰驗證、讀 JSON
export function checkToken(req, res, { allowQuery = false } = {}) {
  const token = process.env.JUDGE_TOKEN;
  if (!token) return true;
  const given = req.headers['x-judge-token'] ?? (allowQuery ? req.query?.token : undefined);
  if (given === token) return true;
  res.status(401).json({ speak: '金鑰錯誤', error: 'unauthorized' });
  return false;
}

export function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return body && typeof body === 'object' ? body : {};
}
