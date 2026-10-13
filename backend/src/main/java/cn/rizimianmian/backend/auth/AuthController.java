package cn.rizimianmian.backend.auth;

import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/wechat/login")
    public AuthDtos.LoginResponse login(@Valid @RequestBody AuthDtos.WechatLoginRequest request) {
        return authService.login(request.code());
    }

    /**
     * 微信云托管内网调用登录。
     * callContainer 会由微信链路注入 X-WX-OPENID（资源复用时为 X-WX-FROM-OPENID），
     * 这里直接使用，不需要小程序再传 code。
     */
    @PostMapping("/cloudrun/login")
    public AuthDtos.LoginResponse cloudRunLogin(
            @RequestHeader(value = "X-WX-OPENID", required = false) String openId,
            @RequestHeader(value = "X-WX-FROM-OPENID", required = false) String fromOpenId,
            @RequestHeader(value = "X-WX-UNIONID", required = false) String unionId,
            @RequestHeader(value = "X-WX-FROM-UNIONID", required = false) String fromUnionId) {
        String resolvedOpenId = (openId == null || openId.isBlank()) ? fromOpenId : openId;
        String resolvedUnionId = (unionId == null || unionId.isBlank()) ? fromUnionId : unionId;
        return authService.loginWithOpenId(resolvedOpenId, resolvedUnionId);
    }

    @GetMapping("/me")
    public AuthDtos.UserView me(Authentication authentication) {
        return AuthDtos.UserView.from(authService.currentUser(authentication.getName()));
    }

    @PostMapping("/profile")
    public AuthDtos.UserView profile(Authentication authentication, @Valid @RequestBody AuthDtos.ProfileRequest request) {
        return authService.updateProfile(authentication.getName(), request);
    }
}
