package cn.rizimianmian.backend.reminders;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ReminderTaskRepository extends JpaRepository<ReminderTaskEntity, String> {
    List<ReminderTaskEntity> findByUserIdOrderByOccurrenceAscCreatedAtAsc(String userId);
    List<ReminderTaskEntity> findByUserIdAndStatusInOrderByOccurrenceAsc(String userId, List<ReminderStatus> statuses);
    List<ReminderTaskEntity> findByStatus(ReminderStatus status);
    List<ReminderTaskEntity> findByStatusAndAuthorizedTrue(ReminderStatus status);

    /** 派发时用：pending（正常待发）+ needs_authorization（多为服务端配置缺失被打回，补配后应自动重试）。 */
    List<ReminderTaskEntity> findByStatusInAndAuthorizedTrue(List<ReminderStatus> statuses);
    Optional<ReminderTaskEntity> findByIdAndUserId(String id, String userId);

    /**
     * 幂等键查询。
     * 不能写成派生方法名，因为 Spring Data 会把 DaysBefore 拆成属性 days + 关键字 Before（小于），
     * 从而报 “No property 'days' found”。这里改用显式 JPQL。
     */
    @Query("select t from ReminderTaskEntity t "
            + "where t.eventId = :eventId and t.occurrence = :occurrence and t.daysBefore = :daysBefore")
    Optional<ReminderTaskEntity> findByEventIdAndOccurrenceAndDaysBefore(@Param("eventId") String eventId,
                                                                        @Param("occurrence") LocalDate occurrence,
                                                                        @Param("daysBefore") int daysBefore);

    List<ReminderTaskEntity> findByEventIdAndUserId(String eventId, String userId);
}
