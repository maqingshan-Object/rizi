package cn.rizimianmian.backend.capsules;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;

/**
 * 送给别人的胶囊：领取卡。
 *
 * <p>⚠️ 读卡**不需要登录**（这是传播的关键：门槛越低传得越远）；
 * 只有「收下」才需要登录（要把它挂到你的账号下）。
 */
@RestController
@RequestMapping("/api/gift")
public class CapsuleGiftController {

    private final CapsuleService service;

    public CapsuleGiftController(CapsuleService service) {
        this.service = service;
    }

    @GetMapping("/{token}")
    public CapsuleDtos.GiftView view(@PathVariable String token) {
        return service.giftView(token, today());
    }

    @PostMapping("/{token}/claim")
    public CapsuleDtos.ClaimView claim(Authentication authentication, @PathVariable String token) {
        if (authentication == null || authentication.getName() == null) {
            throw new IllegalArgumentException("登录后才能收下这份心意");
        }
        return service.claim(authentication.getName(), token, today());
    }

    private LocalDate today() {
        return LocalDate.now(ZoneId.of("Asia/Shanghai"));
    }
}
