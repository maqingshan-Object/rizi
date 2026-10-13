CREATE TABLE IF NOT EXISTS reminder_tasks (
    id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    event_id VARCHAR(36) NOT NULL,
    occurrence DATE NOT NULL,
    days_before INT NOT NULL,
    status VARCHAR(32) NOT NULL,
    last_error VARCHAR(1000) NULL,
    sent_at TIMESTAMP(6) NULL DEFAULT NULL,
    authorized BOOLEAN NOT NULL DEFAULT FALSE,
    authorized_at TIMESTAMP(6) NULL DEFAULT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uk_reminder_task_idempotency (event_id, occurrence, days_before),
    KEY idx_reminder_tasks_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
