-- 时间胶囊：写一段话，指定未来某天启封
--
-- 关键约束（对应产品规则）：
--   1. 封存中（status=sealed）的正文**不通过接口下发**，只有 open_on <= 今天 才允许启封；
--      启封判定一律以服务端日期为准，不信客户端时间。
--   2. kind=self 自用 / kind=gift 送人；送人用 public_token 做领取凭证（谁拿到谁能看）。
--   3. source_capsule_id 记录"传递链"来源：A→B→C 可追溯，但每个用户一生只领一次受赠额度。

CREATE TABLE IF NOT EXISTS capsules (
    id                VARCHAR(36)  NOT NULL,
    user_id           VARCHAR(36)  NOT NULL,
    kind              VARCHAR(16)  NOT NULL,
    title             VARCHAR(120) NULL,
    content           VARCHAR(1000) NOT NULL,
    open_on           DATE         NOT NULL,
    recipient_name    VARCHAR(60)  NULL,
    public_token      VARCHAR(64)  NULL,
    status            VARCHAR(16)  NOT NULL,
    source_capsule_id VARCHAR(36)  NULL,
    created_at        TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    opened_at         TIMESTAMP(6) NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_capsules_token (public_token),
    KEY idx_capsules_user (user_id, status, open_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
