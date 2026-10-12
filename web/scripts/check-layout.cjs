/**
 * 布局回归检查（100% 缩放，deviceScaleFactor = 1）
 *
 * 覆盖 9 个视口宽度 × 5 条代表路由，逐项断言：
 *  1. 左导航（rail）/ 主列（main）/ 右栏（aside）三者是否几何重叠；
 *  2. 整页是否出现横向溢出（scrollWidth > innerWidth）；
 *  3. 滚动后左导航是否仍吸顶（top 恒为 0）；
 *  4. 导航栏内是否有元素越界（标签没随导航收起时会出现）。
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
const ROUTES = [
  ['/', '信息流'],
  ['/bookmarks', '收藏'],
  ['/topic/开源', '话题'],
  ['/u/zhixia', '个人主页'],
  ['/post/p_1001', '动态详情'],
  ['/videos', '短视频'],
];
const WIDTHS = [1920, 1440, 1280, 1190, 1100, 1080, 1050, 1040, 900];

const rectOf = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      right: Math.round(r.right),
      w: Math.round(r.width),
      h: Math.round(r.height),
      display: cs.display,
      pos: cs.position,
    };
  }, sel);

(async () => {
  const browser = await chromium.launch();
  let problems = 0;

  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1, // 100% 缩放
    });
    const page = await ctx.newPage();
    console.log(`\n================ 视口 ${width}px（100% 缩放）================`);

    for (const [route, label] of ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(200);

      const rail = await rectOf(page, 'aside[aria-label="主导航"]');
      const main = await rectOf(page, 'main#main-content');
      const aside = await rectOf(page, 'aside[aria-label="侧边栏"]');
      const shell = await rectOf(page, '.shell, [class*="shell__inner"]');

      const overflow = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        bodyScrollW: document.body.scrollWidth,
      }));

      const gapLeft = shell ? shell.x : -1;
      const gapRight = shell ? overflow.innerW - shell.right : -1;

      /* display:none 的元素矩形全为 0，不能参与重叠判定 */
      const shown = (r) => r !== null && r.w > 0;
      const railR = shown(rail) ? rail : null;
      const mainR = shown(main) ? main : null;
      const asideR = shown(aside) ? aside : null;

      // 重叠判定：前者的右边界越过后者的左边界
      const railOverlapsMain = railR && mainR ? railR.right > mainR.x + 1 : false;
      const railOverlapsAside = railR && asideR ? railR.right > asideR.x + 1 : false;
      const mainOverlapsAside = mainR && asideR ? mainR.right > asideR.x + 1 : false;
      const hOverflow = overflow.scrollW > overflow.innerW + 1;

      const bad = railOverlapsMain || railOverlapsAside || mainOverlapsAside || hOverflow;
      if (bad) problems++;

      console.log(
        `  ${bad ? '✗' : '✓'} ${label.padEnd(6)} ` +
          `rail=[${rail ? `${rail.x}→${rail.right}` : '隐藏'}] ` +
          `main=[${main ? `${main.x}→${main.right}` : '-'}] ` +
          `aside=[${aside ? `${aside.x}→${aside.right}` : '隐藏'}]`,
      );
      console.log(
        `      shell 左留白=${gapLeft} 右留白=${gapRight} ` +
          `横向溢出=${hOverflow ? `${overflow.scrollW}>${overflow.innerW} ✗` : '无'} ` +
          `重叠: rail/main=${railOverlapsMain ? '有 ✗' : '无'} ` +
          `rail/aside=${railOverlapsAside ? '有 ✗' : '无'} ` +
          `main/aside=${mainOverlapsAside ? '有 ✗' : '无'}`,
      );
    }
    /* ---------- 吸顶验证：滚动 1200px 后左导航与信息流 Tab 是否仍在顶部 ---------- */
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const stickyBefore = await rectOf(page, 'aside[aria-label="主导航"]');
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(400);
    const stickyAfter = await rectOf(page, 'aside[aria-label="主导航"]');
    const scrollY = await page.evaluate(() => Math.round(window.scrollY));

    const railPinned = stickyBefore && stickyAfter && Math.abs(stickyAfter.y) <= 2;
    if (!railPinned) problems++;

    console.log(
      `  ${railPinned ? '✓' : '✗'} 吸顶   滚动 ${scrollY}px 后 导航 top=` +
        `${stickyAfter ? stickyAfter.y : '?'}px（应恒为 0）`,
    );

    /* ---------- 导航栏内元素是否越界（标签未随导航收起等） ---------- */
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const bleed = await page.evaluate(() => {
      const rail = document.querySelector('aside[aria-label="主导航"]');
      if (!rail) return { max: 0, n: 0, railRight: 0 };
      const rr = rail.getBoundingClientRect();
      let max = 0;
      let n = 0;
      rail.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > rr.right + 1) {
          n++;
          max = Math.max(max, r.right);
        }
      });
      return { max: Math.round(max), n, railRight: Math.round(rr.right) };
    });
    if (bleed.n > 0) problems++;
    console.log(
      `  ${bleed.n > 0 ? '✗' : '✓'} 导航越界  越界元素=${bleed.n}` +
        `${bleed.n > 0 ? `（最远 ${bleed.max}，导航右边界 ${bleed.railRight}）` : ''}`,
    );

    await ctx.close();
  }

  await browser.close();
  console.log(`\n问题计数：${problems}`);
  process.exit(problems > 0 ? 1 : 0);
})();
