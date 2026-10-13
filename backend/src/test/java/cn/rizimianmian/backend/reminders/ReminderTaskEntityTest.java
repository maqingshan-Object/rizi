package cn.rizimianmian.backend.reminders;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ReminderTaskEntityTest {
    @Test
    void idempotencyKeyUsesEventOccurrenceAndDaysBefore() {
        assertEquals("event-1:2026-06-10:3",
                ReminderTaskEntity.idempotencyKey("event-1", LocalDate.of(2026, 6, 10), 3));
    }

    @Test
    void statusTransitionsDoNotClaimExternalDelivery() {
        ReminderTaskEntity task = new ReminderTaskEntity("user-1", "event-1", LocalDate.of(2026, 6, 10), 3);
        assertEquals(ReminderStatus.pending, task.getStatus());

        task.markNeedsAuthorization("未配置模板");
        assertEquals(ReminderStatus.needs_authorization, task.getStatus());
        task.markPending();
        assertEquals(ReminderStatus.pending, task.getStatus());
        task.markFailed("微信接口失败");
        assertEquals(ReminderStatus.failed, task.getStatus());
        task.markSent();
        assertEquals(ReminderStatus.sent, task.getStatus());
    }
}
