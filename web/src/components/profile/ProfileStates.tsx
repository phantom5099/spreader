import { Ban, FileQuestion, ImageIcon, Heart, PenLine, ShieldAlert } from 'lucide-react';
import styles from './ProfileStates.module.css';

type EmptyKind = 'posts' | 'media' | 'likes' | 'notFound' | 'blocked';

interface ProfileEmptyProps {
  kind: EmptyKind;
  action?: { text: string; onClick: () => void };
}

const META: Record<
  EmptyKind,
  { icon: typeof Ban; title: string; desc: string }
> = {
  posts: {
    icon: PenLine,
    title: '还没有发布动态',
    desc: '当 TA 发布第一条内容时，会显示在这里。',
  },
  media: {
    icon: ImageIcon,
    title: '还没有图片或视频',
    desc: '带媒体的动态会集中显示在这个标签页。',
  },
  likes: {
    icon: Heart,
    title: '还没有公开的喜欢',
    desc: 'TA 点过赞的动态会显示在这里。',
  },
  notFound: {
    icon: FileQuestion,
    title: '找不到这个账号',
    desc: '该用户名可能已被更改，或链接输入有误。',
  },
  blocked: {
    icon: ShieldAlert,
    title: '你已拉黑这个账号',
    desc: '解除拉黑后即可重新查看 TA 的主页和动态。',
  },
};

/**
 * 个人主页空态 / 异常态
 * 不留白页，必须有插画 + 文案 + 行动按钮。
 */
export function ProfileEmpty({ kind, action }: ProfileEmptyProps) {
  const meta = META[kind];
  const Icon = meta.icon;

  return (
    <div className={styles.empty}>
      <span className={styles.empty__icon} aria-hidden>
        <Icon size={26} strokeWidth={1.6} />
      </span>
      <h2 className={styles.empty__title}>{meta.title}</h2>
      <p className={styles.empty__desc}>{meta.desc}</p>
      {action ? (
        <button type="button" className={styles.empty__btn} onClick={action.onClick}>
          {action.text}
        </button>
      ) : null}
    </div>
  );
}
