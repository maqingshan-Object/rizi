-- 记录"谁收下了这份心意" —— 接收方到期的提醒依赖它。
-- 领取码是一对一的：谁先收下就归谁，因此直接在 capsules 上加两列即可，不需要单独的表。
ALTER TABLE capsules ADD COLUMN claimed_by VARCHAR(36) NULL;
ALTER TABLE capsules ADD COLUMN claimed_at TIMESTAMP(6) NULL;
