package cn.rizimianmian.backend.capsules;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;

/** 时间胶囊：自己的胶囊（需登录）。 */
@RestController
@RequestMapping("/api/capsules")
public class CapsuleController {

    private final CapsuleService service;

    public CapsuleController(CapsuleService service) {
        this.service = service;
    }

    @GetMapping
    public CapsuleDtos.ListView list(Authentication authentication) {
        return service.list(authentication.getName(), today());
    }

    @PostMapping
    public CapsuleDtos.CapsuleView create(Authentication authentication,
                                          @RequestBody CapsuleDtos.CreateRequest request) {
        return service.create(authentication.getName(), request, today());
    }

    @GetMapping("/{id}")
    public CapsuleDtos.CapsuleView detail(Authentication authentication, @PathVariable String id) {
        return service.detail(authentication.getName(), id, today());
    }

    @PostMapping("/{id}/open")
    public CapsuleDtos.CapsuleView open(Authentication authentication, @PathVariable String id) {
        return service.open(authentication.getName(), id, today());
    }

    @DeleteMapping("/{id}")
    public void delete(Authentication authentication, @PathVariable String id) {
        service.delete(authentication.getName(), id);
    }

    /** 启封判定一律按**服务端**日期（容器时区已固定为 Asia/Shanghai）。 */
    private LocalDate today() {
        return LocalDate.now(ZoneId.of("Asia/Shanghai"));
    }
}
