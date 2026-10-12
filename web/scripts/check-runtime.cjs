/**
 * 运行期错误巡检：逐条路由加载，捕获 console error 与 pageerror。
 * 重点确认「Maximum update depth exceeded」类无限更新已被消除。
 *
 * 运行前提：
 *  1. 先装 playwright（**不在 devDependencies 里**，需单独装）：
 *       bun add -d playwright && bunx playwright install chromium
 *  2. dev server 已运行（bun run dev），默认 http://127.0.0.1:5173，
 *     可用环境变量 BASE_URL 指向其它地址。
 *
 * 退出码：0 = 无无限更新，1 = 检出无限更新。
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';

const ROUTES = [
  ['/', '信息流'],
  ['/post/p_1001', '动态详情'],
  ['/compose', '发布页'],
  ['/compose/quote/p_1001', '引用转发'],
  ['/publishing/d_1001', '发布中'],
  ['/u/zhixia', '我的主页'],
  ['/u/linwan', '他人主页'],
  ['/u/zhixia/following', '关注列表'],
  ['/u/zhixia/followers', '粉丝列表'],
  ['/settings/lists', '名单管理'],
  ['/messages', '会话列表'],
  ['/messages/c_dm_1', '私聊会话'],
  ['/messages/c_grp_1', '群聊会话'],
  ['/notifications', '通知中心'],
  ['/explore', '发现/搜索'],
  ['/search?q=开源', '搜索结果'],
  ['/topic/开源', '话题页'],
  ['/bookmarks', '收藏'],
  ['/settings', '设置主页'],
  ['/settings/account', '账号设置'],
  ['/settings/preferences', '偏好设置'],
  ['/settings/notifications', '通知设置'],
  ['/settings/display', '显示设置'],
  ['/settings/privacy', '隐私安全'],
  ['/settings/tags', '个性化标签'],
  ['/settings/deactivate', '注销'],
  ['/settings/about', '关于'],
  ['/settings/reports', '举报记录'],
  ['/welcome', '启动页'],
  ['/login', '登录'],
  ['/signup', '注册'],
  ['/signup/profile', '补充信息'],
];

/** 与无限更新相关的错误特征 */
const LOOP_RX = /Maximum update depth exceeded|Too many re-renders|infinite loop/i;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  let loopCount = 0;
  let otherErrorCount = 0;
  const report = [];

  for (const [path, label] of ROUTES) {
    const page = await ctx.newPage();
    const errors = [];
    const pageErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    try {
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 20000 });
      // 停留一段时间，让 effect / 定时器有机会触发循环
      await page.waitForTimeout(1500);
    } catch (e) {
      pageErrors.push('NAV_FAIL: ' + e.message);
    }

    const all = [...errors, ...pageErrors];
    const loops = all.filter((t) => LOOP_RX.test(t));
    const others = all.filter((t) => !LOOP_RX.test(t));

    // 过滤掉与本问题无关的噪音（如 favicon、DevTools 提示）
    const realOthers = others.filter(
      (t) => !/favicon|Download the React DevTools|\[vite\]/i.test(t),
    );

    loopCount += loops.length;
    otherErrorCount += realOthers.length;

    const icon = loops.length > 0 ? 'LOOP' : realOthers.length > 0 ? 'ERR ' : 'OK  ';
    let line = `${icon} ${path.padEnd(34)} ${label}`;
    if (loops.length) line += `\n     无限更新: ${loops[0]?.slice(0, 120)}`;
    if (realOthers.length) line += `\n     其它错误: ${realOthers[0]?.slice(0, 120)}`;
    report.push(line);

    await page.close();
  }

  await browser.close();

  console.log('\n================ 运行期巡检结果 ================\n');
  console.log(report.join('\n'));
  console.log('\n------------------------------------------------');
  console.log(`无限更新错误总数: ${loopCount}`);
  console.log(`其它 console 错误总数: ${otherErrorCount}`);
  console.log(`路由总数: ${ROUTES.length}`);
  console.log('------------------------------------------------\n');

  process.exit(loopCount > 0 ? 1 : 0);
})();
