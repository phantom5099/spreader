// 纯读场景：鉴权中间件 + PG 读。SLO：p95 < 50ms（本机基线）。
import http from 'k6/http';
import { check } from 'k6';
import { BASE, mockLogin, authHeader } from './lib.js';

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<50'],
  },
};

export function setup() {
  return mockLogin();
}

export default function (t) {
  const res = http.get(`${BASE}/v1/me`, authHeader(t.accessToken));
  check(res, { 'me 200': (r) => r.status === 200 });
}
