// 阶梯压测：20→320 VU 逐级加压，找 P95 陡增拐点（容量上限）。
// 无 thresholds——压测目的是观察曲线，不是判定通过。看 Web Dashboard 或 Grafana。
import http from 'k6/http';
import { sleep } from 'k6';
import { BASE, mockLogin, authHeader } from './lib.js';

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '2m', target: 20 },
    { duration: '1m', target: 60 },
    { duration: '2m', target: 60 },
    { duration: '1m', target: 120 },
    { duration: '2m', target: 120 },
    { duration: '1m', target: 200 },
    { duration: '2m', target: 200 },
    { duration: '1m', target: 320 },
    { duration: '2m', target: 320 },
    { duration: '1m', target: 0 },
  ],
};

export function setup() {
  return mockLogin();
}

export default function (t) {
  http.get(`${BASE}/v1/me`, authHeader(t.accessToken)); // 稳定读负载，观察拐点
  sleep(0.2);
}
