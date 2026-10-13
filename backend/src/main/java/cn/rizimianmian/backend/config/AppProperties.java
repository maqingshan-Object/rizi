package cn.rizimianmian.backend.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.util.List;

@Validated
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        Wechat wechat,
        Jwt jwt,
        @NotEmpty List<String> corsAllowedOrigins
) {
    public record Wechat(
            @NotBlank String appId,
            @NotBlank String appSecret,
            @NotBlank String sessionUrl
    ) {}

    public record Jwt(
            @NotBlank String secret,
            long accessTokenMinutes
    ) {}
}
