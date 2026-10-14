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
import java.security.MessageDigest;
import java.security.cert.Certificate;
import java.security.cert.CertificateEncodingException;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Enumeration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 容器内 HTTPS 出网所需的信任库支持。
 *
 * <p>背景：基础镜像里的 JVM 信任库可能缺失或为空，表现为访问微信接口报
 * {@code PKIX path building failed: unable to find valid certification path to requested target}。
 * 因此这里在代码层面显式绑定信任库，而不是只依赖 {@code -Djavax.net.ssl.trustStore} 参数。
 *
 * <p>实测另一种更隐蔽的情形（本环境已证实）：<b>信任库完整（112 个公共 CA）却依然验不过</b>。
 * 抓取对端证书后可见：
 * <pre>
 *   subject = CN=api.weixin.qq.com
 *   issuer  = CN=api.weixin.qq.com     ← 自签名
 *   notBefore = 使用前 32 秒            ← 动态签发
 * </pre>
 * 即出口链路存在 TLS 代理，会按连接动态生成自签名证书，任何公共 CA 都无法验证。
 * 这类环境无法靠"补信任库"解决，只能按需放行：
 * {@code WECHAT_TLS_TRUST_SERVED_CHAIN=true}（默认关闭）会让校验失败时记录证书链并放行。
 * 请知悉该开关等价于对这条出网链路放弃证书校验 —— TLS 由该代理终止，
 * 传输中的 AppSecret 与消息内容对该层可见。
 */
public final class TrustStoreSupport {
    private static final Logger log = LoggerFactory.getLogger(TrustStoreSupport.class);
    private static final String DEFAULT_PASSWORD = "changeit";
    /** 临时放行"服务端实际出示的证书链"的开关；默认关闭。 */
    private static final String TRUST_SERVED_CHAIN_KEY = "WECHAT_TLS_TRUST_SERVED_CHAIN";
    /**
     * 微信云托管「云调用 / 开放接口服务」在容器内安装的自签名证书路径。
     * 官方说明：该证书由云调用在容器内一次性生成，用于容器内以 HTTPS 免鉴权调用微信开放接口。
     * 它是官方机制的一部分，把它加入信任库是官方推荐做法（见微信云托管文档「开放接口服务」）。
     */
    public static final String CLOUD_CALL_CERT = "/app/cert/certificate.crt";
    public static final String CLOUD_CALL_CERT_DIR = "/app/cert";

    private static volatile SSLContext cached;

    /** 已打印过证书链的证书指纹：同一张证书只打一次，避免每分钟刷同样的 PEM。 */
    private static final Set<String> LOGGED_CHAIN_FINGERPRINTS = ConcurrentHashMap.newKeySet();

    private TrustStoreSupport() {}

    /** 容器内是否存在云调用证书（存在即说明云调用的开放接口服务已旁加载到本容器）。 */
    public static boolean cloudCallCertPresent() {
        return new File(CLOUD_CALL_CERT).exists();
    }

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
            int cloudCallCerts = loadCloudCallCerts(store);
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
            log.info("TRUSTSTORE_ACTIVE path={} entries={} cloudCallCerts={} servedChainTrust={} （已显式绑定到出网 HTTPS 客户端）",
                    file.getAbsolutePath(), countEntries(file), cloudCallCerts, trustServedChainEnabled());
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

    /**
     * 把微信云托管「云调用」旁加载服务安装在容器内的证书加入信任库。
     * 这是官方推荐做法：云调用会用自己签发的证书终止 HTTPS，把它导入信任库后，
     * 容器内即可用 HTTPS 免鉴权调用微信开放接口（无需 access_token）。
     */
    private static int loadCloudCallCerts(KeyStore store) {
        File directory = new File(CLOUD_CALL_CERT_DIR);
        File[] files = directory.listFiles((dir, name) -> name.endsWith(".crt") || name.endsWith(".pem"));
        if (files == null || files.length == 0) {
            log.info("TRUSTSTORE_CLOUD_CALL_CERT loaded=0 dir={} （未发现云调用证书；如需容器内免鉴权调用微信接口，"
                    + "请在云托管控制台开启「云调用-开放接口服务」）", CLOUD_CALL_CERT_DIR);
            return 0;
        }
        int loaded = 0;
        try {
            CertificateFactory factory = CertificateFactory.getInstance("X.509");
            for (File file : files) {
                try (InputStream in = new FileInputStream(file)) {
                    for (Certificate certificate : factory.generateCertificates(in)) {
                        store.setCertificateEntry("cloudcall-" + file.getName() + "-" + loaded, certificate);
                        loaded++;
                    }
                } catch (Exception exception) {
                    log.warn("TRUSTSTORE_CLOUD_CALL_CERT_FAILED file={} error={}",
                            file.getName(), exception.getMessage());
                }
            }
        } catch (Exception exception) {
            log.warn("TRUSTSTORE_CLOUD_CALL_CERT_FAILED error={}", exception.getMessage());
        }
        log.info("TRUSTSTORE_CLOUD_CALL_CERT loaded={} dir={}", loaded, CLOUD_CALL_CERT_DIR);
        return loaded;
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
        String fingerprint = chain.length == 0 ? "empty" : fingerprint(chain[0]);
        if (!LOGGED_CHAIN_FINGERPRINTS.add(fingerprint)) {
            return;
        }
        log.warn("TRUSTSTORE_SERVED_CHAIN_ACCEPTED 证书校验失败但已放行（出口存在 TLS 代理）。"
                + "证书 subject 应与 issuer 相同且签发时间接近当前时刻。reason={} length={}",
                cause.getMessage(), chain.length);
        for (int index = 0; index < chain.length; index++) {
            X509Certificate certificate = chain[index];
            log.warn("TRUSTSTORE_SERVED_CHAIN_CERT index={} subject={} issuer={} notBefore={} notAfter={} pem={}",
                    index, certificate.getSubjectX500Principal().getName(),
                    certificate.getIssuerX500Principal().getName(),
                    certificate.getNotBefore(), certificate.getNotAfter(), toPem(certificate));
        }
    }

    private static String fingerprint(X509Certificate certificate) {
        try {
            return Base64.getEncoder()
                    .encodeToString(MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded()));
        } catch (Exception exception) {
            return "unknown";
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
