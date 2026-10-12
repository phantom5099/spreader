/**
 * 端到端：账号菜单 + 退出登录 + 未登录拦截 + 四种登录方式
 * （含 Demo 账号 admin@admin / 123456）
 *
 * 运行前提：
 *  1. 先装 playwright（**不在 devDependencies 里**，需单独装）：
 *       bun add -d playwright && bunx playwright install chromium
 *  2. dev server 已运行（bun run dev），默认 http://127.0.0.1:5173，
 *     可用环境变量 BASE_URL 指向其它地址。
 *
 * 退出码：0 = 全部通过，1 = 有问题。
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const problems = [];

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  /* 1. 打开账号菜单 */
  await page.getByRole('button', { name: '账号菜单' }).click();
  await page.waitForTimeout(250);
  const menuVisible = await page.getByRole('menu', { name: '账号菜单' }).isVisible();
  console.log('1) 账号菜单打开:', menuVisible);
  if (!menuVisible) problems.push('账号菜单未能打开');

  /* 2. 退出登录 → 二次确认 */
  await page.getByRole('menuitem', { name: '退出登录' }).click();
  await page.waitForTimeout(250);
  const dialog = page.getByRole('dialog');
  console.log('2) 二次确认出现:', await dialog.isVisible());

  await page.getByRole('button', { name: '退出登录' }).last().click();
  await page.waitForTimeout(700);
  console.log('3) 退出后 URL:', page.url());
  if (!page.url().includes('/login')) problems.push('退出后未跳转登录页');

  /* 4. 未登录直接访问信息流 → 应被弹回登录页 */
  await page.goto(`${BASE}/bookmarks`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  console.log('4) 未登录访问 /bookmarks 落点:', page.url());
  if (!page.url().includes('/login')) problems.push('未登录访问受保护路由未被拦截');

  /* 5. 确认「暂不登录」按钮已删除 */
  const guest = await page.getByText('暂不登录').count();
  console.log('5) 「暂不登录」残留数:', guest);
  if (guest > 0) problems.push('「暂不登录」入口仍存在');

  /* 6. 手机号 + 验证码 登录 */
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('textbox', { name: /手机号|邮箱/ }).first().fill('13800000000');
  await page.getByRole('button', { name: '获取验证码' }).click();
  await page.waitForTimeout(900);
  const codeBox = page.getByPlaceholder('6 位数字');
  await codeBox.fill('123456');
  await page.getByRole('button', { name: '登录', exact: true }).last().click();
  await page.waitForTimeout(1200);
  console.log('6) 手机号验证码登录后 URL:', page.url());
  if (page.url().replace(/\/$/, '') !== BASE) problems.push('手机号验证码登录未成功');

  /* 7. 退出后用 admin@admin / 123456 重新登录 */
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '账号菜单' }).click();
  await page.waitForTimeout(200);
  await page.getByRole('menuitem', { name: '退出登录' }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: '退出登录' }).last().click();
  await page.waitForTimeout(800);

  await page.getByRole('tab', { name: '邮箱' }).click();
  await page.waitForTimeout(150);
  await page.getByRole('tab', { name: '密码' }).click();
  await page.waitForTimeout(150);
  await page.locator('input[type=tel], input[type=email]').first().fill('admin@admin');
  await page.locator('input[type=password]').first().fill('123456');
  await page.waitForTimeout(150);
  const submitDisabled = await page.getByRole('button', { name: '登录', exact: true }).last().isDisabled();
  console.log('7) admin@admin 登录按钮 disabled:', submitDisabled);
  if (submitDisabled) problems.push('admin@admin + 123456 无法提交登录');
  await page.getByRole('button', { name: '登录', exact: true }).last().click();
  await page.waitForTimeout(1200);
  console.log('8) Demo 账号登录后 URL:', page.url());
  if (page.url().replace(/\/$/, '') !== BASE) problems.push('admin@admin 登录未成功');

  /* 9. 刷新后仍保持登录 */
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const stillIn = await page.getByRole('button', { name: '账号菜单' }).isVisible();
  console.log('9) 刷新后仍已登录:', stillIn);
  if (!stillIn) problems.push('刷新后登录态丢失');

  console.log('\n===== 结论 =====');
  console.log(problems.length ? problems.join('\n') : '全部通过');
  await browser.close();
  process.exit(problems.length ? 1 : 0);
})();
