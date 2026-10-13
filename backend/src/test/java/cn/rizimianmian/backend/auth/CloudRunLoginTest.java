package cn.rizimianmian.backend.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 微信云托管内网调用登录：callContainer 会把 OpenID 放在请求头里，
 * 后端应直接使用该 OpenID 建立账号，不需要小程序再传 code。
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.MOCK,
        properties = {
                "spring.datasource.url=jdbc:h2:mem:cloudrunlogin;MODE=MySQL;DB_CLOSE_DELAY=-1",
                "spring.datasource.username=sa",
                "spring.datasource.password=",
                "spring.datasource.driver-class-name=org.h2.Driver",
                "spring.jpa.hibernate.ddl-auto=create-drop",
                "spring.flyway.enabled=false",
                "app.jwt.secret=cloudrun-login-secret-at-least-32-bytes-long",
                "app.wechat.app-secret=cloudrun-login-secret",
                "app.wechat.subscribe-template-id="
        })
@AutoConfigureMockMvc
class CloudRunLoginTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void logsInUsingContainerOpenIdHeader() throws Exception {
        mockMvc.perform(post("/api/auth/cloudrun/login")
                        .header("X-WX-OPENID", "openid-from-container")
                        .header("X-WX-UNIONID", "unionid-from-container")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.user.id").isNotEmpty())
                .andExpect(jsonPath("$.expiresInSeconds").value(7200));
    }

    @Test
    void fallsBackToResourceReuseHeader() throws Exception {
        mockMvc.perform(post("/api/auth/cloudrun/login")
                        .header("X-WX-FROM-OPENID", "openid-from-reuse")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty());
    }

    @Test
    void rejectsWhenNoWechatHeaderPresent() throws Exception {
        mockMvc.perform(post("/api/auth/cloudrun/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
    }
}
