package cn.rizimianmian.backend.auth;

import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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

    @GetMapping("/me")
    public AuthDtos.UserView me(Authentication authentication) {
        return AuthDtos.UserView.from(authService.currentUser(authentication.getName()));
    }

    @PostMapping("/profile")
    public AuthDtos.UserView profile(Authentication authentication, @Valid @RequestBody AuthDtos.ProfileRequest request) {
        return authService.updateProfile(authentication.getName(), request);
    }
}
