package cn.rizimianmian.backend.events;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EventRepository extends JpaRepository<EventEntity, String> {
    List<EventEntity> findAllByUserIdOrderByDateAscCreatedAtAsc(String userId);
    Optional<EventEntity> findByIdAndUserId(String id, String userId);
    List<EventEntity> findByReminderEnabledTrue();
}