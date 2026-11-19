// 刷新场景：每迭代 登录 → RT 轮换（CAS 原子轮换 + Redis 指纹写）。
// RT 一次性：无法复用旧令牌刷新，故按"登录+刷新"组合计量。
// SLO：refresh 单跳 p95 < 100ms（本机基线，按 tag 过滤）。
import http from 'k6/http';
import { check } from 'k6';
import { BASE, mockLogin } from './lib.js';

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:refresh}': ['p(95)<100'],
  },
};

export default function () {
  const t = mockLogin();
  const res = http.post(`${BASE}/v1/auth/token:refresh`, JSON.stringify({
    refreshToken: t.refreshToken,
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'refresh' },
  });
  check(res, { 'refresh 200': (r) => r.status === 200 });
}
