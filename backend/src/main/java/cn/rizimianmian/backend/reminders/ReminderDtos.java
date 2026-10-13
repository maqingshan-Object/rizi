package cn.rizimianmian.backend.reminders;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class ReminderDtos {
    private ReminderDtos() {}

    public record TaskIdsRequest(List<String> taskIds) {}

    /**
     * authorized 必须一并返回：status=pending 同时代表「刚创建·尚未授权」和
     * 「已授权·等待到期发送」两种含义，只靠 status 无法区分，会让小程序把
     * 「已开启提醒」显示成「等待订阅授权」。
     */
    public record ReminderView(
            String id,
            String eventId,
            LocalDate occurrence,
            int daysBefore,
            ReminderStatus status,
            boolean authorized,
            String lastError,
            Instant sentAt,
            Instant createdAt,
            Instant updatedAt
    ) {
        public static ReminderView from(ReminderTaskEntity task) {
            return new ReminderView(task.getId(), task.getEventId(), task.getOccurrence(), task.getDaysBefore(),
                    task.getStatus(), task.isAuthorized(), task.getLastError(), task.getSentAt(),
                    task.getCreatedAt(), task.getUpdatedAt());
        }
    }
}