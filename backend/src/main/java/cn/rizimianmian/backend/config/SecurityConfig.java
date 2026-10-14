package cn.rizimianmian.backend.config;

import cn.rizimianmian.backend.auth.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {
    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, JwtAuthenticationFilter jwtFilter) throws Exception {
        return http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> {})
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/api/health",
                                "/api/auth/wechat/login", "/api/auth/cloudrun/login",
                                // 虚拟支付发货回调由微信服务器直接调用，没有我们的登录态，必须放行
                                "/api/pay/notify",
                                // 时间胶囊的"领取卡"：收到卡片的人免登录就能看到"有人给你留了话"，
                                // 这是传播的关键；只有"收下"才需要登录（在接口里自行判断）
                                "/api/gift/**").permitAll()
                        .anyRequest().authenticated())
                // 未带 token / token 过期时，返回 401 + 可读 JSON。
                // Spring Security 默认是"403 + 空 body"，小程序拿不到 message 只能显示
                // 「云托管服务返回异常。」，用户完全看不出是登录过期还是后端故障。
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) ->
                                writeJson(response, HttpServletResponse.SC_UNAUTHORIZED,
                                        "AUTH_REQUIRED", "登录已过期或未登录，请重新登录后再试。"))
                        .accessDeniedHandler((request, response, deniedException) ->
                                writeJson(response, HttpServletResponse.SC_FORBIDDEN,
                                        "FORBIDDEN", "当前账号无权访问该资源。")))
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    /** 安全链路上的错误响应也统一成 {code, message}，与业务异常保持同一形状。 */
    private static void writeJson(HttpServletResponse response, int status, String code, String message)
            throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"code\":\"" + code + "\",\"message\":\"" + message + "\"}");
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(AppProperties properties) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(properties.corsAllowedOrigins());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of(HttpHeaders.AUTHORIZATION, HttpHeaders.CONTENT_TYPE));
        configuration.setAllowCredentials(false);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    JwtAuthenticationFilter jwtAuthenticationFilter(JwtService jwtService, UserRepository users) {
        return new JwtAuthenticationFilter(jwtService, users);
    }

    static final class JwtAuthenticationFilter extends OncePerRequestFilter {
        private final JwtService jwtService;
        private final UserRepository users;

        JwtAuthenticationFilter(JwtService jwtService, UserRepository users) {
            this.jwtService = jwtService;
            this.users = users;
        }

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            String header = request.getHeader(HttpHeaders.AUTHORIZATION);
            if (header != null && header.startsWith("Bearer ")) {
                try {
                    String userId = jwtService.subject(header.substring(7));
                    users.findById(userId).ifPresent(user -> {
                        var authentication = new UsernamePasswordAuthenticationToken(
                                user.getId(), null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
                        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(authentication);
                    });
                } catch (RuntimeException ignored) {
                    // Spring Security returns 401 for protected endpoints without a valid authentication.
                }
            }
            chain.doFilter(request, response);
        }
    }
}
