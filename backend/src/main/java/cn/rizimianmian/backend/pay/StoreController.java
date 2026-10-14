package cn.rizimianmian.backend.pay;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 商店：商品列表、下单（返回支付签名）、订单状态、我的权益。 */
@RestController
@RequestMapping("/api/store")
public class StoreController {

    private final StoreService service;

    public StoreController(StoreService service) {
        this.service = service;
    }

    @GetMapping("/products")
    public List<PayDtos.ProductView> products(Authentication authentication) {
        return service.products(authentication.getName());
    }

    @PostMapping("/orders")
    public PayDtos.OrderView createOrder(Authentication authentication, @RequestBody PayDtos.OrderRequest request) {
        return service.createOrder(authentication.getName(), request);
    }

    /** 前端支付返回后来查一次：微信的 success 只算弱确认，最终以后端订单状态为准。 */
    @GetMapping("/orders/{outTradeNo}")
    public PayDtos.OrderView orderStatus(Authentication authentication, @PathVariable String outTradeNo) {
        return service.orderStatus(authentication.getName(), outTradeNo);
    }

    @GetMapping("/entitlements")
    public List<PayDtos.EntitlementView> entitlements(Authentication authentication) {
        return service.entitlements(authentication.getName());
    }
}
