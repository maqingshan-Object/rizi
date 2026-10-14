package cn.rizimianmian.backend.capsules;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CapsuleRepository extends JpaRepository<CapsuleEntity, String> {
    List<CapsuleEntity> findByUserIdOrderByOpenOnAsc(String userId);

    Optional<CapsuleEntity> findByIdAndUserId(String id, String userId);

    Optional<CapsuleEntity> findByPublicToken(String publicToken);
}
