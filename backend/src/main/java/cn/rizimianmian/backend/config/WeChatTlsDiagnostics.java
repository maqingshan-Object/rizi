package cn.rizimianmian.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import javax.net.ssl.HttpsURLConnection;
import java.io.File;
import java.io.FileInputStream;
import java.net.URI;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.Enumeration;

/**
 * 启动自检：把"提醒为什么发不出去"最常被问的几件事直接写进日志，省掉一轮一轮猜。
 * 全程不打印敏感值（AppSecret / 模板 ID 只报"是否已配置"）。
 *
 * <p>排查索引：
 * <ul>
 *   <li>{@code TLS_DIAGNOSTIC_TRUSTSTORE_ENTRIES=0} —— JVM 信任库为空，
 *       调用任何 HTTPS 都会以 {@code PKIX path building failed} 失败（容器镜像常见坑）</li>
 *   <li>{@code TLS_DIAGNOSTIC_HANDSHAKE=failed} —— 连不上微信接口（证书链或出口网络问题）</li>
 *   <li>{@code WECHAT_DIAGNOSTIC templateFields ...} —— 模板字段名必须与公众平台模板里的
 *       {{xxx.DATA}} 完全一致，不一致微信会返回 47003 参数不合法</li>
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
        reportTrustStore();
        reportWechatConfig();
        probeWechatApi();
    }

    private void reportTrustStore() {
        String configured = System.getProperty("javax.net.ssl.trustStore");
        File trustStore = configured != null
                ? new File(configured)
                : new File(System.getProperty("java.home"), "lib/security/cacerts");
        String password = System.getProperty("javax.net.ssl.trustStorePassword", "changeit");

        log.info("TLS_DIAGNOSTIC_TRUSTSTORE path={} exists={} size={}B",
                trustStore.getAbsolutePath(), trustStore.exists(), trustStore.length());
        try (FileInputStream in = new FileInputStream(trustStore)) {
            KeyStore store = KeyStore.getInstance(KeyStore.getDefaultType());
            store.load(in, password.toCharArray());
            int count = 0;
            Enumeration<String> aliases = store.aliases();
            while (aliases.hasMoreElements()) {
                aliases.nextElement();
                count++;
            }
            log.info("TLS_DIAGNOSTIC_TRUSTSTORE_ENTRIES={} （0 表示信任库为空，调微信接口必然 PKIX 失败）", count);
        } catch (Exception exception) {
            log.warn("TLS_DIAGNOSTIC_TRUSTSTORE_UNREADABLE error={}", exception.getMessage());
        }
    }

    private void reportWechatConfig() {
        AppProperties.Wechat wechat = properties.wechat();
        log.info("WECHAT_DIAGNOSTIC appId={} appSecretConfigured={} templateIdConfigured={}",
                wechat.appId(), hasText(wechat.appSecret()), hasText(wechat.subscribeTemplateId()));
        log.info("WECHAT_DIAGNOSTIC templateFields name={} date={} days={}",
                wechat.templateNameField(), wechat.templateDateField(), wechat.templateDaysField());
        log.info("WECHAT_DIAGNOSTIC urls accessToken={} subscribe={}",
                wechat.accessTokenUrl(), wechat.subscribeMessageUrl());
        log.info("WECHAT_DIAGNOSTIC jwtAccessTokenMinutes={}", properties.jwt().accessTokenMinutes());
    }

    private void probeWechatApi() {
        try {
            HttpsURLConnection connection = (HttpsURLConnection) URI.create(properties.wechat().accessTokenUrl())
                    .toURL().openConnection();
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.setRequestMethod("GET");
            int status = connection.getResponseCode();
            String issuer = "unknown";
            Certificate[] chain = connection.getServerCertificates();
            if (chain.length > 0 && chain[0] instanceof X509Certificate certificate) {
                issuer = certificate.getIssuerX500Principal().getName();
            }
            log.info("TLS_DIAGNOSTIC_HANDSHAKE=ok httpStatus={} serverCertIssuer={}", status, issuer);
        } catch (Exception exception) {
            log.warn("TLS_DIAGNOSTIC_HANDSHAKE=failed type={} error={}",
                    exception.getClass().getSimpleName(), exception.getMessage());
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
