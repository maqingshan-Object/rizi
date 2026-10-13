package cn.rizimianmian.backend.auth;

import cn.rizimianmian.backend.config.AppProperties;
import cn.rizimianmian.backend.config.JwtService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class AuthService {
    private final UserRepository users;
    private final WechatSessionClient wechat;
    private final JwtService jwt;
    private final AppProperties properties;

    public AuthService(UserRepository users, WechatSessionClient wechat, JwtService jwt, AppProperties properties) {
        this.users = users;
        this.wechat = wechat;
        this.jwt = jwt;
        this.properties = properties;
    }

    @Transactional
    public AuthDtos.LoginResponse login(String code) {
        WechatSessionClient.WechatSession session = wechat.exchangeCode(code);
        UserEntity user = users.findByOpenId(session.openid())
                .orElseGet(() -> users.save(new UserEntity(UUID.randomUUID().toString(), session.openid(), session.unionid())));
        return new AuthDtos.LoginResponse(
                jwt.issue(user.getId()),
                properties.jwt().accessTokenMinutes() * 60,
                AuthDtos.UserView.from(user));
    }

    @Transactional(readOnly = true)
    public UserEntity currentUser(String userId) {
        return users.findById(userId).orElseThrow(() -> new IllegalArgumentException("登录身份不存在，请重新登录"));
    }

    @Transactional
    public AuthDtos.UserView updateProfile(String userId, AuthDtos.ProfileRequest request) {
        UserEntity user = currentUser(userId);
        String avatarUrl = request.avatarUrl() == null || request.avatarUrl().isBlank() ? user.getAvatarUrl() : request.avatarUrl().trim();
        user.updateProfile(request.nickname().trim(), avatarUrl);
        return AuthDtos.UserView.from(users.save(user));
    }
}
