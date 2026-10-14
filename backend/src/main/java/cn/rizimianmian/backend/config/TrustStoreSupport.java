package cn.rizimianmian.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.KeyStore;
import java.security.cert.CertificateEncodingException;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Enumeration;
import java.util.List;

/**
 * 容器内 HTTPS 出网所需的信任库支持。
 *
 * <p>背景：基础镜像里的 JVM 信任库可能缺失或为空，表现为访问微信接口报
 * {@code PKIX path building failed: unable to find valid certification path to requested target}。
 * 因此这里在代码层面显式绑定信任库，而不是只依赖 {@code -Djavax.net.ssl.trustStore} 参数。
 *
 * <p>实测发现另一种更隐蔽的情形：<b>信任库完整（112 个公共 CA）却依然验不过</b>，
 * 说明容器拿到的证书并不是真正的服务端证书 —— 出口链路被 TLS 代理替换了证书。
 * 这种情况需要在信任库里导入该代理的 CA；在此之前，可用
 * {@code WECHAT_TLS_TRUST_SERVED_CHAIN=true} 临时放行，并把对端证书链打进日志，
 * 便于后续按 CA 白名单固化（该开关默认关闭）。
 */
public final class TrustStoreSupport {
    private static final Logger log = LoggerFactory.getLogger(TrustStoreSupport.class);
    private static final String DEFAULT_PASSWORD = "changeit";
    /** 临时放行"服务端实际出示的证书链"的开关；默认关闭。 */
    private static final String TRUST_SERVED_CHAIN_KEY = "WECHAT_TLS_TRUST_SERVED_CHAIN";

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

    /** 是否允许信任服务端实际出示的证书链（出口被 TLS 代理拦截时使用）。 */
    public static boolean trustServedChainEnabled() {
        String flag = System.getenv(TRUST_SERVED_CHAIN_KEY);
        if (flag == null) {
            flag = System.getProperty("wechat.tls.trust-served-chain");
        }
        return flag != null && ("true".equalsIgnoreCase(flag.trim()) || "1".equals(flag.trim()));
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
            TrustManager[] managers = factory.getTrustManagers();
            if (trustServedChainEnabled()) {
                managers = wrapWithChainRecorder(managers);
                log.warn("TRUSTSTORE_SERVED_CHAIN_TRUST=on —— 证书校验失败时将放行并打印对端证书链；"
                        + "该模式无法防御中间人，仅用于出口被代理拦截的排查，问题定位后请改为把代理 CA 导入信任库并关闭本开关");
            }
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, managers, null);
            log.info("TRUSTSTORE_ACTIVE path={} entries={} servedChainTrust={} （已显式绑定到出网 HTTPS 客户端）",
                    file.getAbsolutePath(), countEntries(file), trustServedChainEnabled());
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

    private static TrustManager[] wrapWithChainRecorder(TrustManager[] originals) {
        List<TrustManager> wrapped = new ArrayList<>();
        for (TrustManager original : originals) {
            if (original instanceof X509TrustManager x509) {
                wrapped.add(new ServedChainTrustManager(x509));
            } else {
                wrapped.add(original);
            }
        }
        return wrapped.toArray(new TrustManager[0]);
    }

    /** 默认仍走标准校链；只有校验失败时才记录证书链（放行与否取决于开关）。 */
    private static final class ServedChainTrustManager implements X509TrustManager {
        private final X509TrustManager delegate;

        ServedChainTrustManager(X509TrustManager delegate) {
            this.delegate = delegate;
        }

        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            delegate.checkClientTrusted(chain, authType);
        }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            try {
                delegate.checkServerTrusted(chain, authType);
            } catch (CertificateException exception) {
                logChain(chain, exception);
            }
        }

        @Override
        public X509Certificate[] getAcceptedIssuers() {
            return delegate.getAcceptedIssuers();
        }
    }

    private static void logChain(X509Certificate[] chain, CertificateException cause) {
        log.warn("TRUSTSTORE_SERVED_CHAIN reason={} length={}", cause.getMessage(), chain.length);
        for (int index = 0; index < chain.length; index++) {
            X509Certificate certificate = chain[index];
            log.warn("TRUSTSTORE_SERVED_CHAIN_CERT index={} subject={} issuer={} notAfter={} pem={}",
                    index, certificate.getSubjectX500Principal().getName(),
                    certificate.getIssuerX500Principal().getName(), certificate.getNotAfter(), toPem(certificate));
        }
    }

    private static String toPem(X509Certificate certificate) {
        try {
            return "-----BEGIN CERTIFICATE-----"
                    + Base64.getEncoder().encodeToString(certificate.getEncoded())
                    + "-----END CERTIFICATE-----";
        } catch (CertificateEncodingException exception) {
            return "unavailable";
        }
    }
}
