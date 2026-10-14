package cn.rizimianmian.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import javax.net.ssl.HttpsURLConnection;
import java.io.File;
import java.net.URI;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;

/**
 * 出网自检：把"提醒为什么发不出去"最常被问的几件事直接写进日志，省掉一轮一轮猜。
 * 全程不打印敏感值（AppSecret / 模板 ID 只报"是否已配置"）。
 *
 * <p>注意：启动日志很快会被定时任务的日志刷走（云托管日志页往往搜不到），
 * 所以 {@link #logSummary()} 还会被 {@code ReminderScheduler} 每次扫描时调用一次，
 * 保证这些关键信息一定能落在日志窗口里。
 *
 * <p>排查索引：
 * <ul>
 *   <li>{@code TRUSTSTORE_BIND_FAILED} 或 {@code TLS_DIAGNOSTIC_TRUSTSTORE … entries=-1}
 *       —— 信任库不可读，任何 HTTPS 都会 PKIX 失败</li>
 *   <li>{@code TLS_DIAGNOSTIC_HANDSHAKE=failed} —— 拿到的证书链不被信任；
 *       若"出口做了 TLS 拦截"，对端签发者会是内网 CA（看 serverCertIssuer）</li>
 *   <li>{@code WECHAT_DIAGNOSTIC … templateFields} —— 字段名必须与公众平台模板里的
 *       {{xxx.DATA}} 完全一致，否则微信返回 47003</li>
 * </ul>
 */
@Component
public class WeChatTlsDiagnostics implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(WeChatTlsDiagnostics.class);

    private final AppProperties properties;

    public WeChatTlsDiagnostics(AppProperties properties) {
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        logSummary();
    }

    /** 启动时与每次定时扫描时都会调用；内容全部为不含敏感值的诊断信息。 */
    public void logSummary() {
        File file = TrustStoreSupport.trustStoreFile();
        log.info("TLS_DIAGNOSTIC_TRUSTSTORE path={} exists={} size={}B entries={}",
                file.getAbsolutePath(), file.exists(), file.length(), TrustStoreSupport.countEntries(file));

        AppProperties.Wechat wechat = properties.wechat();
        log.info("WECHAT_DIAGNOSTIC appId={} appSecretConfigured={} templateIdConfigured={}",
                wechat.appId(), hasText(wechat.appSecret()), hasText(wechat.subscribeTemplateId()));
        log.info("WECHAT_DIAGNOSTIC templateFields name={} date={} days={} subscribeUrl={}",
                wechat.templateNameField(), wechat.templateDateField(), wechat.templateDaysField(),
                wechat.subscribeMessageUrl());
        log.info("WECHAT_DIAGNOSTIC jwtAccessTokenMinutes={}", properties.jwt().accessTokenMinutes());

        probe(wechat.accessTokenUrl());
    }

    /** 用「与业务完全相同的 SSLContext」探测一次 TLS 握手，便于与线上发送失败原因直接对比。 */
    private void probe(String url) {
        try {
            HttpsURLConnection connection = (HttpsURLConnection) URI.create(url).toURL().openConnection();
            connection.setSSLSocketFactory(TrustStoreSupport.sslContext().getSocketFactory());
            connection.setConnectTimeout(3000);
            connection.setReadTimeout(3000);
            connection.setRequestMethod("GET");
            int status = connection.getResponseCode();
            String issuer = "unknown";
            Certificate[] chain = connection.getServerCertificates();
            if (chain.length > 0 && chain[0] instanceof X509Certificate certificate) {
                issuer = certificate.getIssuerX500Principal().getName();
            }
            log.info("TLS_DIAGNOSTIC_HANDSHAKE=ok httpStatus={} serverCertIssuer={}", status, issuer);
        } catch (Exception exception) {
            log.warn("TLS_DIAGNOSTIC_HANDSHAKE=failed type={} error={}", exception.getClass().getSimpleName(), exception.getMessage());
            if (!TrustStoreSupport.trustServedChainEnabled()) {
                log.warn("TLS_DIAGNOSTIC_HINT=若上面 TRUSTSTORE_ACTIVE 的 entries 正常（如 112）却仍失败，"
                        + "说明拿到的证书不是真实的公共证书（出口被 TLS 代理替换）。"
                        + "可设 WECHAT_TLS_TRUST_SERVED_CHAIN=true 临时放行，并会把对端证书链打进日志（TRUSTSTORE_SERVED_CHAIN_CERT）");
            }
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
