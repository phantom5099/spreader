-- login_audit 补人机验证审计字段（§4.5 不变量 5：challenge_id/kind/结果入审计）
ALTER TABLE login_audit ADD COLUMN IF NOT EXISTS captcha_challenge_id text NOT NULL DEFAULT '';
ALTER TABLE login_audit ADD COLUMN IF NOT EXISTS captcha_kind text NOT NULL DEFAULT '';
ALTER TABLE login_audit ADD COLUMN IF NOT EXISTS captcha_result text NOT NULL DEFAULT '';
