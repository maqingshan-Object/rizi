CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) NOT NULL,
    openid VARCHAR(64) NOT NULL,
    unionid VARCHAR(64) NULL,
    nickname VARCHAR(64) NULL,
    avatar_url VARCHAR(1024) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_openid (openid)
);
