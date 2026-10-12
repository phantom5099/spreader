/**
 * 头像占位生成
 * Demo 不依赖外部图片（离线可用、避免外链失效）。
 * 用「确定性调色板 + 首字」生成 SVG data-URI，保证同一用户每次一致。
 */

const PALETTE = [
  ['#ffd6cc', '#8a3b22'],
  ['#cfe3ff', '#1f4a86'],
  ['#d6f5e3', '#1c6b4a'],
  ['#ffe8b8', '#7a5410'],
  ['#e3d9ff', '#4a327f'],
  ['#ffd9e8', '#8a2a55'],
  ['#d9f0f5', '#1c5f6b'],
  ['#f0e0cf', '#6b4a2a'],
  ['#e0e8ff', '#2f3f8a'],
  ['#d8f0d0', '#356b26'],
  ['#f5dcd0', '#7a3f28'],
  ['#dcd6f0', '#4a3a72'],
  ['#f0eecb', '#6b6417'],
  ['#cbe9ee', '#175a66'],
  ['#f7dcee', '#7a2a5c'],
  ['#dfe4dd', '#3f4a3a'],
] as const;

/** 简单字符串哈希（FNV-1a 变体），用于确定性取色 */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * 生成头像 data-URI。
 * @param seed 稳定标识（如 user_id），保证同一用户头像不变
 * @param label 显示在头像上的字（昵称首字）
 */
export function avatarDataUri(seed: string, label: string): string {
  const [bg, fg] = PALETTE[hash(seed) % PALETTE.length]!;
  const char = [...label][0] ?? '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="${bg}"/><text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" font-size="34" font-weight="600" fill="${fg}">${escapeXml(char)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 生成媒体占位图。
 * @param seed 稳定标识（如 content_id + 序号）
 * @param width/height 声明尺寸（用于布局占位）
 * @param kind 类型，影响配色倾向
 */
export function mediaPlaceholder(
  seed: string,
  width: number,
  height: number,
  kind: 'photo' | 'video' = 'photo',
): string {
  const h = hash(seed);
  const hue = h % 360;
  const hue2 = (hue + 40) % 360;
  const sat = kind === 'video' ? 32 : 46;
  const light = kind === 'video' ? 30 : 62;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},${sat}%,${light}%)"/>
      <stop offset="100%" stop-color="hsl(${hue2},${sat}%,${Math.max(18, light - 22)}%)"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  ${
    kind === 'video'
      ? `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.09}" fill="rgba(255,255,255,0.82)"/>
         <path d="M ${width / 2 - Math.min(width, height) * 0.035} ${height / 2 - Math.min(width, height) * 0.055} L ${width / 2 + Math.min(width, height) * 0.06} ${height / 2} L ${width / 2 - Math.min(width, height) * 0.035} ${height / 2 + Math.min(width, height) * 0.055} Z" fill="hsl(${hue},${sat}%,${light}%)"/>`
      : ''
  }
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 生成会动的竖屏占位图（短视频用）。
 *
 * 与静态占位图同一套色相策略，但内嵌 SMIL 动画：一团缓慢游走的辉光、两道斜向
 * 扫过的光带、一层呼吸式暗角。接真实音源之前，画面本身就有运动，不会静止成一张图。
 *
 * @param seed 稳定标识（如 content_id），保证同一条视频每次一致
 */
export function motionPlaceholder(seed: string, width: number, height: number): string {
  const h = hash(seed);
  const hue = h % 360;
  const hue2 = (hue + 48) % 360;
  const cx = Math.round(width / 2);
  const cy = Math.round(height * 0.34);
  const r = Math.round(Math.min(width, height) * 0.6);
  const drift = Math.round(width * 0.14);
  const bob = Math.round(height * 0.12);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},40%,23%)"/>
      <stop offset="100%" stop-color="hsl(${hue2},46%,7%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="hsl(${hue},88%,66%)" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="hsl(${hue},88%,66%)" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#fff" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="vig" cx="50%" cy="46%" r="72%">
      <stop offset="52%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.6"/>
    </radialGradient>
    <clipPath id="frame"><rect width="${width}" height="${height}"/></clipPath>
  </defs>

  <g clip-path="url(#frame)">
    <rect width="${width}" height="${height}" fill="url(#bg)"/>

    <ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r}" fill="url(#glow)">
      <animate attributeName="cx" values="${cx - drift};${cx + drift};${cx - drift}" dur="11s" repeatCount="indefinite"/>
      <animate attributeName="cy" values="${cy};${cy + bob};${cy}" dur="13s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.7;1;0.7" dur="7s" repeatCount="indefinite"/>
    </ellipse>

    <g opacity="0.55">
      <rect x="${Math.round(-width * 0.4)}" y="${Math.round(-height * 0.2)}" width="${Math.round(width * 0.2)}" height="${Math.round(height * 1.5)}" fill="url(#beam)" transform="rotate(17 ${cx} ${cy})">
        <animate attributeName="x" values="${Math.round(-width * 0.5)};${Math.round(width * 1.3)}" dur="6.5s" repeatCount="indefinite"/>
      </rect>
      <rect x="${Math.round(-width * 0.4)}" y="${Math.round(-height * 0.2)}" width="${Math.round(width * 0.12)}" height="${Math.round(height * 1.5)}" fill="url(#beam)" transform="rotate(17 ${cx} ${cy})">
        <animate attributeName="x" values="${Math.round(-width * 0.6)};${Math.round(width * 1.1)}" dur="9.5s" begin="-4s" repeatCount="indefinite"/>
      </rect>
    </g>

    <rect width="${width}" height="${height}" fill="url(#vig)"/>
  </g>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
