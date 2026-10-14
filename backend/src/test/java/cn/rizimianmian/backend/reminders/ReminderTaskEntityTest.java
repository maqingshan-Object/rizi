package cn.rizimianmian.backend.reminders;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

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

    @Test
    void dueDateIsOccurrenceMinusDaysBefore() {
        ReminderTaskEntity task = new ReminderTaskEntity("user-1", "event-1", LocalDate.of(2026, 6, 10), 7);
        assertEquals(LocalDate.of(2026, 6, 3), task.dueDate());
    }

    @Test
    void dueWindowCoversTheDueDayAndGraceDays() {
        // 发生日 6/10、提前 3 天 ⇒ 到期日 6/7
        ReminderTaskEntity task = new ReminderTaskEntity("user-1", "event-1", LocalDate.of(2026, 6, 10), 3);

        assertFalse(task.isDueWithin(LocalDate.of(2026, 6, 6), 3), "还没到期，不该发");
        assertTrue(task.isDueWithin(LocalDate.of(2026, 6, 7), 3), "到期日当天该发");
        assertTrue(task.isDueWithin(LocalDate.of(2026, 6, 8), 3), "补发窗口内该补发");
        assertTrue(task.isDueWithin(LocalDate.of(2026, 6, 10), 3), "窗口最后一天仍是 6/7+3");
        assertFalse(task.isDueWithin(LocalDate.of(2026, 6, 11), 3), "超出窗口不再发");
        assertFalse(task.isDueWithin(LocalDate.of(2026, 6, 11), 0), "宽限为 0 时等同旧的精确匹配");
    }
}
