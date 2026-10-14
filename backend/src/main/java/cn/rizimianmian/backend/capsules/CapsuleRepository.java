package cn.rizimianmian.backend.capsules;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CapsuleRepository extends JpaRepository<CapsuleEntity, String> {
    List<CapsuleEntity> findByUserIdOrderByOpenOnAsc(String userId);

    Optional<CapsuleEntity> findByIdAndUserId(String id, String userId);

    Optional<CapsuleEntity> findByPublicToken(String publicToken);

    /** 今天到期且仍未启封的胶囊（定时提醒用）。 */
    java.util.List<CapsuleEntity> findByOpenOnAndStatus(java.time.LocalDate openOn, CapsuleEntity.Status status);
}
