// 发码场景：Redis 频控写 + 通道抽象（console 通道，绝不发真短信）。
// 每迭代独立 dest 避开冷却；SLO：p95 < 100ms（本机基线）。
import http from 'k6/http';
import { check } from 'k6';
import { BASE } from './lib.js';

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<100'],
  },
};

export default function () {
  // 登录即注册：唯一邮箱自动建号，同时绕开发码冷却（冷却绑 dest）
  const dest = `loadtest${__VU}.${__ITER}@test.local`;
  const res = http.post(`${BASE}/v1/auth/otp:send`, JSON.stringify({
    channel: 'email', destination: dest, scene: 'login',
  }), { headers: { 'Content-Type': 'application/json' } });
  check(res, { 'otp:send 200': (r) => r.status === 200 });
}
