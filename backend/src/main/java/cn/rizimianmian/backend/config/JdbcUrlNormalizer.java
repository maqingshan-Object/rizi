package cn.rizimianmian.backend.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.MutablePropertySources;

import java.util.HashMap;
import java.util.Map;

/**
 * MySQL 服务端字符集名 utf8mb4 不是合法的 Java charset 名称，
 * 一旦 JDBC URL 中出现 characterEncoding=utf8mb4，驱动会在建立连接前抛出
 * UnsupportedEncodingException，Flyway 与 JPA 都会随之启动失败。
 *
 * 这里在应用启动早期统一纠正 URL 参数，保证无论云托管环境变量里写的是
 * utf8mb4、utf8 还是 UTF8，最终下发给驱动的都是 UTF-8。
 * 数据库表字符集仍然保持 utf8mb4，不受影响。
 */
public class JdbcUrlNormalizer implements EnvironmentPostProcessor, Ordered {

    static final String OVERRIDE_SOURCE_NAME = "jdbcUrlNormalizer";
    private static final String[] URL_KEYS = {"spring.datasource.url", "spring.flyway.url"};

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        Map<String, Object> overrides = new HashMap<>();
        for (String key : URL_KEYS) {
            String value = environment.getProperty(key);
            if (value == null || value.isBlank()) {
                continue;
            }
            String normalized = normalize(value);
            if (!normalized.equals(value)) {
                overrides.put(key, normalized);
            }
        }
        if (overrides.isEmpty()) {
            return;
        }
        MutablePropertySources sources = environment.getPropertySources();
        sources.remove(OVERRIDE_SOURCE_NAME);
        sources.addFirst(new MapPropertySource(OVERRIDE_SOURCE_NAME, overrides));
    }

    /**
     * 把 JDBC URL 中的 characterEncoding 参数统一为 UTF-8。
     * 仅替换参数值，不动主机、端口、库名和其他参数。
     */
    public static String normalize(String url) {
        if (url == null || url.isBlank()) {
            return url;
        }
        String result = url.replaceAll("(?i)characterEncoding\\s*=\\s*utf8mb4", "characterEncoding=UTF-8");
        result = result.replaceAll("(?i)characterEncoding\\s*=\\s*utf-?8\\b", "characterEncoding=UTF-8");
        return result;
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 20;
    }
}
