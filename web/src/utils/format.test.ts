import { describe, expect, it } from 'vitest';

import {
  formatAbsoluteTime,
  formatCount,
  formatDuration,
  formatRelativeTime,
  visibilityLabel,
} from '@/utils/format';

/**
 * 构造本地时间，再用同一套本地分量去做断言，
 * 这样测试在任何时区下结果都一致。
 */
function at(y: number, m: number, d: number, h = 0, mi = 0, s = 0): number {
  return new Date(y, m - 1, d, h, mi, s).getTime();
}

function iso(y: number, m: number, d: number, h = 0, mi = 0, s = 0): string {
  return new Date(y, m - 1, d, h, mi, s).toISOString();
}

describe('formatRelativeTime', () => {
  it('无法解析的时间返回空串', () => {
    expect(formatRelativeTime('')).toBe('');
    expect(formatRelativeTime('not-a-date')).toBe('');
  });

  it('一分钟以内显示“刚刚”', () => {
    expect(formatRelativeTime(iso(2026, 10, 13, 12, 0), at(2026, 10, 13, 12, 0))).toBe('刚刚');
    expect(formatRelativeTime(iso(2026, 10, 13, 12, 0), at(2026, 10, 13, 12, 0, 59))).toBe('刚刚');
  });

  it('未来时间被夹到 0，同样显示“刚刚”', () => {
    expect(formatRelativeTime(iso(2026, 10, 13, 12, 0), at(2026, 10, 13, 11, 0))).toBe('刚刚');
  });

  it('一小时以内显示分钟', () => {
    expect(formatRelativeTime(iso(2026, 10, 13, 12, 0), at(2026, 10, 13, 12, 5))).toBe('5分');
    expect(formatRelativeTime(iso(2026, 10, 13, 12, 0), at(2026, 10, 13, 12, 59))).toBe('59分');
  });

  it('一天以内显示小时', () => {
    expect(formatRelativeTime(iso(2026, 10, 13, 12, 0), at(2026, 10, 13, 13, 0))).toBe('1小时');
    expect(formatRelativeTime(iso(2026, 10, 13, 12, 0), at(2026, 10, 14, 11, 0))).toBe('23小时');
  });

  it('满 24 小时切换到日期', () => {
    expect(formatRelativeTime(iso(2026, 10, 13, 12, 0), at(2026, 10, 14, 12, 0))).toBe('10月13日');
  });

  it('同年只显示月日，跨年补上年份', () => {
    expect(formatRelativeTime(iso(2026, 10, 13, 12, 0), at(2026, 10, 20, 12, 0))).toBe('10月13日');
    expect(formatRelativeTime(iso(2026, 1, 2, 12, 0), at(2026, 10, 20, 12, 0))).toBe('1月2日');
    expect(formatRelativeTime(iso(2025, 10, 8, 12, 0), at(2026, 10, 20, 12, 0))).toBe('2025年10月8日');
  });
});

describe('formatAbsoluteTime', () => {
  it('无法解析的时间返回空串', () => {
    expect(formatAbsoluteTime('')).toBe('');
    expect(formatAbsoluteTime('nope')).toBe('');
  });

  it('下午时间带 12 小时制与零填充分钟', () => {
    expect(formatAbsoluteTime(iso(2026, 10, 11, 15, 24))).toBe('下午3:24 · 2026年10月11日');
    expect(formatAbsoluteTime(iso(2026, 10, 11, 12, 0))).toBe('下午12:00 · 2026年10月11日');
  });

  it('上午时间与 0 点都按 12 小时制显示', () => {
    expect(formatAbsoluteTime(iso(2026, 10, 11, 9, 7))).toBe('上午9:07 · 2026年10月11日');
    expect(formatAbsoluteTime(iso(2026, 10, 11, 0, 5))).toBe('上午12:05 · 2026年10月11日');
    expect(formatAbsoluteTime(iso(2026, 1, 2, 11, 59))).toBe('上午11:59 · 2026年1月2日');
  });
});

describe('formatCount', () => {
  it('一千以下原样输出', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
  });

  it('一万以下加千位分隔符', () => {
    expect(formatCount(1000)).toBe('1,000');
    expect(formatCount(1234)).toBe('1,234');
    expect(formatCount(9999)).toBe('9,999');
  });

  it('一万到一亿之间用“万”，且整数不带小数尾巴', () => {
    expect(formatCount(10000)).toBe('1万');
    expect(formatCount(12480)).toBe('1.2万');
    expect(formatCount(4200000)).toBe('420万');
    expect(formatCount(99999)).toBe('10万');
  });

  it('一亿以上用“亿”', () => {
    expect(formatCount(100000000)).toBe('1亿');
    expect(formatCount(245000000)).toBe('2亿');
  });
});

describe('formatDuration', () => {
  it('缺省或非正值返回空串', () => {
    expect(formatDuration()).toBe('');
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(-100)).toBe('');
  });

  it('毫秒换算成 分:秒，秒位补零', () => {
    expect(formatDuration(95000)).toBe('1:35');
    expect(formatDuration(5000)).toBe('0:05');
    expect(formatDuration(59999)).toBe('1:00');
    expect(formatDuration(3600000)).toBe('60:00');
  });
});

describe('visibilityLabel', () => {
  it('已知范围映射到对应文案', () => {
    expect(visibilityLabel('followers')).toBe('仅关注者可见');
    expect(visibilityLabel('mutual')).toBe('仅互关好友可见');
    expect(visibilityLabel('specified')).toBe('指定好友可见');
    expect(visibilityLabel('private')).toBe('仅自己可见');
  });

  it('未知值兜底为公开', () => {
    expect(visibilityLabel('public')).toBe('公开');
    expect(visibilityLabel('')).toBe('公开');
    expect(visibilityLabel('whatever')).toBe('公开');
  });
});
