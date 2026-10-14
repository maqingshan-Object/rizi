-- 虚拟支付：订单与用户权益
-- 说明：
--   pay_orders          —— 每一笔虚拟支付订单（道具直购）
--   user_entitlements   —— 用户已获得的权益（已购主题 / 时间胶囊余额 / 赞赏记录）
-- 幂等：out_trade_no 唯一，回调重复到达时不会重复发货。

CREATE TABLE IF NOT EXISTS pay_orders (
    id            VARCHAR(36)  NOT NULL,
    user_id       VARCHAR(36)  NOT NULL,
    product_id    VARCHAR(64)  NOT NULL,
    out_trade_no  VARCHAR(32)  NOT NULL,
    price_cents   INT          NOT NULL,
    status        VARCHAR(32)  NOT NULL,
    platform      VARCHAR(16)  NULL,
    delivered     BOOLEAN      NOT NULL DEFAULT FALSE,
    raw_notify    VARCHAR(2000) NULL,
    created_at    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    paid_at       TIMESTAMP(6) NULL DEFAULT NULL,
    updated_at    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uk_pay_orders_out_trade_no (out_trade_no),
    KEY idx_pay_orders_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 同一个用户、同一种权益只保留一行，数量累加（时间胶囊就是这样攒的）
CREATE TABLE IF NOT EXISTS user_entitlements (
    id         VARCHAR(36) NOT NULL,
    user_id    VARCHAR(36) NOT NULL,
    item_type  VARCHAR(32) NOT NULL,
    item_key   VARCHAR(64) NOT NULL,
    quantity   INT         NOT NULL DEFAULT 1,
    order_id   VARCHAR(36) NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_entitlement (user_id, item_type, item_key),
    KEY idx_user_entitlements_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
