-- 过期会话清理按 expires_at 单列过滤；既有 idx_sessions_user 前导列是 user_id，用不上。
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- 注：迁移器在事务内执行，此处不能用 CREATE INDEX CONCURRENTLY。
-- 若某个环境已有大表需要在线建索引，改在事务外手工执行 CONCURRENTLY 版本。
