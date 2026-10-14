package cn.rizimianmian.backend.pay;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EntitlementRepository extends JpaRepository<EntitlementEntity, String> {
    Optional<EntitlementEntity> findByUserIdAndItemTypeAndItemKey(String userId, EntitlementType itemType, String itemKey);

    List<EntitlementEntity> findByUserIdOrderByCreatedAtAsc(String userId);
}
