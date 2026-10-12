/**
 * 举报原因分类（Demo）
 *
 * 属服务端配置：审核类目调整时不需要发版，故放在数据层而非组件内。
 */
export interface ReportReason {
  key: string;
  label: string;
  desc: string;
  sub?: string[];
}

export const REPORT_REASONS: ReportReason[] = [
  {
    key: 'spam',
    label: '垃圾内容',
    desc: '重复发布、刷屏、诱导点击或商业推广',
  },
  {
    key: 'harassment',
    label: '骚扰与仇恨言论',
    desc: '针对个人或群体的攻击、威胁、歧视',
  },
  {
    key: 'violence',
    label: '暴力与血腥',
    desc: '展示真实暴力、伤害或令人不适的画面',
  },
  {
    key: 'adult',
    label: '成人内容',
    desc: '露骨的色情内容或性暗示',
  },
  {
    key: 'selfharm',
    label: '自杀或自残',
    desc: '鼓励、美化自伤行为的内容',
  },
  {
    key: 'misinfo',
    label: '虚假信息',
    desc: '可能造成现实伤害的误导性内容',
  },
  {
    key: 'impersonation',
    label: '冒充他人',
    desc: '冒用他人身份、头像或名义',
  },
  {
    key: 'copyright',
    label: '侵犯版权',
    desc: '未经授权使用他人的作品',
  },
];
