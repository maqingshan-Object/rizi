package cn.rizimianmian.backend.reminders;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ReminderTaskRepository extends JpaRepository<ReminderTaskEntity, String> {
    List<ReminderTaskEntity> findByUserIdOrderByOccurrenceAscCreatedAtAsc(String userId);
    List<ReminderTaskEntity> findByUserIdAndStatusInOrderByOccurrenceAsc(String userId, List<ReminderStatus> statuses);
    List<ReminderTaskEntity> findByStatus(ReminderStatus status);
    List<ReminderTaskEntity> findByStatusAndAuthorizedTrue(ReminderStatus status);
    Optional<ReminderTaskEntity> findByIdAndUserId(String id, String userId);
    Optional<ReminderTaskEntity> findByEventIdAndOccurrenceAndDaysBefore(String eventId, LocalDate occurrence, int daysBefore);
    List<ReminderTaskEntity> findByEventIdAndUserId(String eventId, String userId);
}