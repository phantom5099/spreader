/// <reference types="vite/client" />

/**
 * CSS Modules 类型声明
 * vite/client 自带 *.module.css 的宽松声明，但 tsconfig 已开 strict，
 * 这里显式声明为 Record<string, string>，保证 styles.xxx 取值为 string。
 */
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.css' {
  const content: string;
  export default content;
}
