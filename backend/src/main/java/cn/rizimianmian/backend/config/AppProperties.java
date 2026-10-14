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
        VirtualPay virtualPay,
        @NotEmpty List<String> corsAllowedOrigins
) {
    public record Wechat(
            @NotBlank String appId,
            @NotBlank String appSecret,
            @NotBlank String sessionUrl,
            @NotBlank String accessTokenUrl,
            @NotBlank String subscribeMessageUrl,
            String subscribeTemplateId,
            String accessToken,
            String templateNameField,
            String templateDateField,
            String templateDaysField
    ) {}

    public record Jwt(
            @NotBlank String secret,
            long accessTokenMinutes
    ) {}

    /**
     * 小程序虚拟支付配置。
     *
     * <p>所有字段都允许为空 —— 没配置时应用照常启动，商店接口会明确返回
     * "支付未配置"，而不是 500。等后台拿到 OfferID / AppKey 后再填环境变量即可。
     *
     * <p>⚠️ AppKey 属于密钥：只能放在云托管环境变量里，**绝不进代码库、绝不下发前端**。
     */
    public record VirtualPay(
            String offerId,
            String appKey,
            String sandboxAppKey,
            Integer env,
            String queryOrderUrl
    ) {
        /** OfferID + 对应环境的 AppKey 都有了才算配置完成。 */
        public boolean configured() {
            return notBlank(offerId) && notBlank(activeAppKey());
        }

        /** 0 正式 / 1 沙箱。 */
        public int resolvedEnv() {
            return env == null ? 0 : env;
        }

        /** 按 env 选现网或沙箱 AppKey。 */
        public String activeAppKey() {
            return resolvedEnv() == 1 ? safe(sandboxAppKey) : safe(appKey);
        }

        private static boolean notBlank(String value) {
            return value != null && !value.isBlank();
        }

        private static String safe(String value) {
            return value == null ? "" : value;
        }
    }
}
