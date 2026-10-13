import styles from './Highlight.module.css';

interface HighlightProps {
  text: string;
  /** 需要高亮的关键词（不区分大小写） */
  query: string;
}

/**
 * 关键词高亮（高亮色为 --accent）
 * 用「切分 + 命中段包 span」替代 dangerouslySetInnerHTML，避免注入风险。
 */
export function Highlight({ text, query }: HighlightProps) {
  const q = query.trim();
  if (!q) return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  while (cursor < text.length) {
    const hit = lowerText.indexOf(lowerQ, cursor);
    if (hit === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (hit > cursor) parts.push(text.slice(cursor, hit));
    parts.push(
      <mark key={key} className={styles.mark}>
        {text.slice(hit, hit + q.length)}
      </mark>,
    );
    key += 1;
    cursor = hit + q.length;
  }

  return <>{parts}</>;
}
