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
        return issueFor(session.openid(), session.unionid());
    }

    /**
     * 微信云托管 callContainer 内网调用时，微信链路已把 OpenID 放在请求头里，
     * 后端可直接使用，无需再用 code 调用 jscode2session。
     */
    @Transactional
    public AuthDtos.LoginResponse loginWithOpenId(String openId, String unionId) {
        if (openId == null || openId.isBlank()) {
            throw new IllegalArgumentException("未获取到微信 OpenID，请确认通过微信云托管 callContainer 调用。");
        }
        return issueFor(openId.trim(), unionId == null || unionId.isBlank() ? null : unionId.trim());
    }

    private AuthDtos.LoginResponse issueFor(String openId, String unionId) {
        UserEntity user = users.findByOpenId(openId)
                .orElseGet(() -> users.save(new UserEntity(UUID.randomUUID().toString(), openId, unionId)));
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
