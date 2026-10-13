package cn.rizimianmian.backend.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {
    private AuthDtos() {}

    public record WechatLoginRequest(@NotBlank @Size(max = 256) String code) {}

    public record ProfileRequest(
            @NotBlank @Size(max = 20) String nickname,
            @Size(max = 1024) String avatarUrl
    ) {}

    public record UserView(String id, String nickname, String avatarUrl) {
        static UserView from(UserEntity user) {
            return new UserView(user.getId(), user.getNickname(), user.getAvatarUrl());
        }
    }

    public record LoginResponse(String accessToken, long expiresInSeconds, UserView user) {}
}
