package cn.rizimianmian.backend.pay;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PayOrderRepository extends JpaRepository<PayOrderEntity, String> {
    Optional<PayOrderEntity> findByOutTradeNo(String outTradeNo);

    List<PayOrderEntity> findByUserIdOrderByCreatedAtDesc(String userId);
}
