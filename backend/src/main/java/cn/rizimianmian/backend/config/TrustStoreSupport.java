package cn.rizimianmian.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.KeyStore;
import java.util.Enumeration;

/**
 * 容器内 HTTPS 出网所需的信任库支持。
 *
 * <p>背景：基础镜像里的 JVM 信任库可能缺失或为空，表现为访问微信接口报
 * {@code PKIX path building failed: unable to find valid certification path to requested target}。
 * 这里把信任库<b>在代码层面显式绑定</b>到 SSLContext，而不只是依赖
 * {@code -Djavax.net.ssl.trustStore} 参数被所有 HTTP 实现正确识别 —— 出网客户端
 * （JDK HttpClient）会直接使用这个 SSLContext，排除"参数没生效"这类不确定性。
 */
public final class TrustStoreSupport {
    private static final Logger log = LoggerFactory.getLogger(TrustStoreSupport.class);
    private static final String DEFAULT_PASSWORD = "changeit";

    private static volatile SSLContext cached;

    private TrustStoreSupport() {}

    /** 优先取 -Djavax.net.ssl.trustStore 指定的文件，否则用 JVM 自带 cacerts。 */
    public static File trustStoreFile() {
        String configured = System.getProperty("javax.net.ssl.trustStore");
        if (configured != null && !configured.isBlank()) {
            return new File(configured);
        }
        return new File(System.getProperty("java.home"), "lib/security/cacerts");
    }

    public static String password() {
        return System.getProperty("javax.net.ssl.trustStorePassword", DEFAULT_PASSWORD);
    }

    /** 信任库里的条目数；-1 表示读不出来（文件缺失/密码不对/格式不兼容）。 */
    public static int countEntries(File file) {
        try (InputStream in = new FileInputStream(file)) {
            KeyStore store = KeyStore.getInstance(KeyStore.getDefaultType());
            store.load(in, password().toCharArray());
            int count = 0;
            Enumeration<String> aliases = store.aliases();
            while (aliases.hasMoreElements()) {
                aliases.nextElement();
                count++;
            }
            return count;
        } catch (Exception exception) {
            log.warn("TRUSTSTORE_COUNT_FAILED path={} error={}", file.getAbsolutePath(), exception.getMessage());
            return -1;
        }
    }

    /** 取得（并缓存）信任库对应的 SSLContext；失败时回退到 JVM 默认实现。 */
    public static SSLContext sslContext() {
        SSLContext local = cached;
        if (local != null) {
            return local;
        }
        synchronized (TrustStoreSupport.class) {
            if (cached == null) {
                cached = build();
            }
            return cached;
        }
    }

    private static SSLContext build() {
        File file = trustStoreFile();
        try {
            KeyStore store = KeyStore.getInstance(KeyStore.getDefaultType());
            try (InputStream in = new FileInputStream(file)) {
                store.load(in, password().toCharArray());
            }
            TrustManagerFactory factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            factory.init(store);
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, factory.getTrustManagers(), null);
            log.info("TRUSTSTORE_ACTIVE path={} entries={} （已显式绑定到出网 HTTPS 客户端）",
                    file.getAbsolutePath(), countEntries(file));
            return context;
        } catch (Exception exception) {
            log.warn("TRUSTSTORE_BIND_FAILED path={} error={} —— 回退到 JVM 默认信任库",
                    file.getAbsolutePath(), exception.getMessage());
            try {
                return SSLContext.getDefault();
            } catch (Exception fatal) {
                throw new IllegalStateException("无法初始化 SSLContext", fatal);
            }
        }
    }
}
