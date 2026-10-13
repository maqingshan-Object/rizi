CREATE TABLE IF NOT EXISTS flyway_smoke_probe (
    id BIGINT NOT NULL,
    checked_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
