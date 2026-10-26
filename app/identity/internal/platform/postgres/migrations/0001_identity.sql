-- identity 域 schema（幂等：IF NOT EXISTS，供启动时自动迁移）
-- ID 由数据库侧生成（gen_random_uuid），不用自增主键。

CREATE TABLE IF NOT EXISTS users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone         text UNIQUE,                -- 须先 E.164 归一化再写入，否则唯一约束防不住异形同号
    email         text UNIQUE,                -- 须先 lower 归一化再写入
    nickname      text NOT NULL DEFAULT '',   -- 展示资料；onboarding_required 由服务端实时推导，不落列
    avatar_url    text NOT NULL DEFAULT '',
    status        text NOT NULL DEFAULT 'ACTIVE', -- ACTIVE/RESTRICTED/BANNED/…，权限边界判定依据
    token_version bigint NOT NULL DEFAULT 0,  -- 改密码/封禁时 +1，全集群旧令牌随之失效
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 口令类凭据：全库最敏感，常规查询路径不触达；kind 预留 passkey（将来存公钥，不加表）。
CREATE TABLE IF NOT EXISTS user_credentials (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        text NOT NULL,                -- 'password' | 'passkey'(预留)
    identifier  text NOT NULL,                -- 该口令凭据绑定手机号(E.164)还是邮箱(lower)
    secret      text NOT NULL,                -- Argon2id PHC 串 / passkey 公钥
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, kind)                    -- 一种凭据类型每用户一条
);
CREATE INDEX IF NOT EXISTS idx_user_credentials_identifier ON user_credentials (identifier);

-- 主体级绑定（行 = 本地账号在某 provider 的身份；跨端归并正确性的约束载体）。
CREATE TABLE IF NOT EXISTS third_party_accounts (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider   text NOT NULL,
    subject_id text NOT NULL,                 -- 用户级稳定标识：微信 unionid / Google sub / GitHub id
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, provider),               -- 每 provider 每账号一条：绑定列表语义，换绑=更新行
    UNIQUE (provider, subject_id)             -- 一个用户级标识只指向一个账号
);

-- 应用级身份（行 = 提供方在某应用下的一个身份；登录查找键，行的主语是提供方侧身份）。
CREATE TABLE IF NOT EXISTS third_party_identities (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider      text NOT NULL,
    appid         text NOT NULL,              -- 我方在提供方注册的应用/客户端标识
    external_id   text NOT NULL,              -- 应用内标识：微信 openid / Google sub / GitHub id
    profile_json  jsonb NOT NULL DEFAULT '{}',-- 提供方原始资料快照
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz,
    UNIQUE (provider, appid, external_id)     -- 只落在登录查找键上
);

-- 会话（RT 轮换链与重放检测的事实源；事实源在 PG，Redis 只承载热状态）。
CREATE TABLE IF NOT EXISTS sessions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(), -- 与 family_id 同值：一行 = 一次登录的轮换链
    user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id    uuid NOT NULL,
    device_id    text NOT NULL DEFAULT '',
    platform     text NOT NULL DEFAULT '',
    rt_hash      text NOT NULL UNIQUE,          -- 当前有效 RT 的 SHA-256，原始令牌永不入库
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz,
    expires_at   timestamptz NOT NULL,          -- 过期清理依据；稳态规模 = 活跃用户 × 设备数
    revoked_at   timestamptz                    -- 非空即已吊销
);
CREATE INDEX IF NOT EXISTS idx_sessions_family ON sessions (family_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id, expires_at);

-- 登录审计：由 eventlog 同步落库，
-- 写入时已脱敏，保留 12 个月到期清理。
CREATE TABLE IF NOT EXISTS login_audit (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid,                   -- 登录失败且账号不存在时为 NULL
    login_type        text NOT NULL,
    identifier_masked text NOT NULL,          -- 脱敏后的手机号/邮箱，完整值不落审计表
    result            text NOT NULL,          -- succeeded | failed
    reason            text NOT NULL DEFAULT '',
    ip                text NOT NULL DEFAULT '',
    device_id         text NOT NULL DEFAULT '',
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_audit_user_time ON login_audit (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_login_audit_time ON login_audit (created_at);
