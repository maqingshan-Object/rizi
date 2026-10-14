package cn.rizimianmian.backend.reminders;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ReminderTaskRepository extends JpaRepository<ReminderTaskEntity, String> {
    List<ReminderTaskEntity> findByUserIdOrderByOccurrenceAscCreatedAtAsc(String userId);
    List<ReminderTaskEntity> findByUserIdAndStatusInOrderByOccurrenceAsc(String userId, List<ReminderStatus> statuses);
    List<ReminderTaskEntity> findByStatus(ReminderStatus status);
    List<ReminderTaskEntity> findByStatusAndAuthorizedTrue(ReminderStatus status);

    /**
     * 派发时用：pending（正常待发）+ needs_authorization（多为服务端配置缺失被打回，补配后应自动重试）
     * + failed（网络/证书/配置类故障，修好后应自动重试）。
     *
     * 加悲观写锁：云托管可能同时跑多个实例，日志里已出现过两个实例同时扫描同一批任务
     * （重复 REMINDER_SCAN/MATCH）。FOR UPDATE 让它们串行化 —— 先拿到锁的实例会把任务改成
     * sent/failed，后拿到的实例再查时该行已不满足 status IN (...)，自然不会重复发送。
     * 一次性订阅额度有限，重复发送代价很高，所以这里必须有并发保护。
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
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
