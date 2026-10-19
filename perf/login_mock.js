// 全登录流程：authorize → confirm → login（PG 写、JWT 签发、RT 插入、事务）。
// SLO：p95 < 300ms（本机基线）。
import { check } from 'k6';
import { BASE, mockLogin } from './lib.js';

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300'],
  },
};

export default function () {
  mockLogin(); // 内部含全部三跳与 check
}
