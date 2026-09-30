-- 本地开发数据库初始化（架构文档 §3.6.16：UUIDv7 由数据库侧生成）
-- 挂载到 /docker-entrypoint-initdb.d，仅在数据卷为空时执行一次。

-- UUIDv7 生成函数由 PostgreSQL 18 内置（uuidv7()），无需扩展。
-- 此处仅确认版本满足要求。

DO $$
BEGIN
  IF current_setting('server_version_num')::int < 180000 THEN
    RAISE EXCEPTION '本项目要求 PostgreSQL 18+（UUIDv7 需 uuidv7() 内置函数，见架构文档 §3.6.16）';
  END IF;
END $$;

-- 常用扩展
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- 模糊匹配与相似度
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- 加密函数（密码哈希以外的摘要用途）
