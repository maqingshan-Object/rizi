package cn.rizimianmian.backend.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class JdbcUrlNormalizerTest {

    private static final String BASE = "jdbc:mysql://db.example.com:20353/days";

    @Test
    void replacesMysqlCharsetNameWithJavaCharsetName() {
        assertEquals(BASE + "?characterEncoding=UTF-8&serverTimezone=Asia/Shanghai",
                JdbcUrlNormalizer.normalize(BASE + "?characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai"));
    }

    @Test
    void replacesShortUtf8Alias() {
        assertEquals(BASE + "?characterEncoding=UTF-8",
                JdbcUrlNormalizer.normalize(BASE + "?characterEncoding=utf8"));
    }

    @Test
    void replacesUpperCasedAliasWithoutDash() {
        assertEquals(BASE + "?characterEncoding=UTF-8",
                JdbcUrlNormalizer.normalize(BASE + "?characterEncoding=UTF8"));
    }

    @Test
    void keepsAlreadyCorrectValueStable() {
        String url = BASE + "?useSSL=false&characterEncoding=UTF-8&serverTimezone=Asia/Shanghai";
        assertEquals(url, JdbcUrlNormalizer.normalize(url));
    }

    @Test
    void isIdempotent() {
        String once = JdbcUrlNormalizer.normalize(BASE + "?characterEncoding=utf8mb4");
        assertEquals(once, JdbcUrlNormalizer.normalize(once));
    }

    @Test
    void leavesOtherParametersAndDatabaseUntouched() {
        assertEquals(BASE + "?useSSL=false&useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Shanghai",
                JdbcUrlNormalizer.normalize(BASE + "?useSSL=false&useUnicode=true&characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai"));
    }

    @Test
    void leavesUrlWithoutEncodingParameterUntouched() {
        String url = BASE + "?useSSL=false";
        assertEquals(url, JdbcUrlNormalizer.normalize(url));
    }

    @Test
    void toleratesBlankAndNullInput() {
        assertNull(JdbcUrlNormalizer.normalize(null));
        assertEquals("", JdbcUrlNormalizer.normalize(""));
    }
}
