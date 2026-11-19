// 公共流程：mock 第三方登录全流程（authorize → confirm → login）。
// 依赖 loadtest 配置：mock 放行、OTP 通道 console。
import http from 'k6/http';
import { check } from 'k6';

export const BASE = __ENV.BASE_URL || 'http://127.0.0.1:8000';

// mockLogin 走完整 mock 第三方登录，返回 { accessToken, refreshToken }。
export function mockLogin() {
  // ① 服务端签发 state 并返回 mock 授权页地址
  const ar = http.get(`${BASE}/v1/auth/thirdparty/authorize?provider=wechat_mock&platform=web`);
  check(ar, { 'authorize 200': (r) => r.status === 200 });
  const authURL = ar.json('authorizationUrl'); // protojson：字段名走 proto json_name（camelCase）
  // ② 授权页取 state → confirm 换一次性 code（302 + JSON）
  const page = http.get(authURL);
  check(page, { 'authorize page 200': (r) => r.status === 200 });
  const m = page.body.match(/name="state" value="([^"]+)"/);
  if (!m) {
    throw new Error('mock 授权页未找到 state（检查 loadtest 配置是否放行 mock）');
  }
  const conf = http.post(`${BASE}/mock/oauth/confirm`, { state: m[1] });
  check(conf, { 'confirm 302': (r) => r.status === 302 });
  const code = conf.json('code');
  // ③ 统一登录：code 换身份 + 签发 AT/RT
  const login = http.post(`${BASE}/v1/auth/login`, JSON.stringify({
    type: 'LOGIN_TYPE_THIRD_PARTY',
    thirdParty: { provider: 'wechat_mock', code: code, state: m[1], platform: 'web' },
    deviceId: 'k6',
  }), { headers: { 'Content-Type': 'application/json' } });
  check(login, { 'login 200': (r) => r.status === 200 });
  return { accessToken: login.json('accessToken'), refreshToken: login.json('refreshToken') };
}

export const authHeader = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
