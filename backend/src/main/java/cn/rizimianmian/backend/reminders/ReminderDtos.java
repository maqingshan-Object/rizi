package cn.rizimianmian.backend.reminders;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class ReminderDtos {
    private ReminderDtos() {}

    public record TaskIdsRequest(List<String> taskIds) {}

    public record ReminderView(
            String id,
            String eventId,
            LocalDate occurrence,
            int daysBefore,
            ReminderStatus status,
            String lastError,
            Instant sentAt,
            Instant createdAt,
            Instant updatedAt
    ) {
        public static ReminderView from(ReminderTaskEntity task) {
            return new ReminderView(task.getId(), task.getEventId(), task.getOccurrence(), task.getDaysBefore(),
                    task.getStatus(), task.getLastError(), task.getSentAt(), task.getCreatedAt(), task.getUpdatedAt());
        }
    }
}