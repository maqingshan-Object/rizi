package cn.rizimianmian.backend.common;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> validation(MethodArgumentNotValidException exception) {
        String message = exception.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(error -> error.getField() + "：" + error.getDefaultMessage())
                .orElse("请求参数无效");
        return ResponseEntity.badRequest().body(new ApiError("VALIDATION_ERROR", message));
    }

    @ExceptionHandler(AuthenticationCredentialsNotFoundException.class)
    ResponseEntity<ApiError> unauthorized(AuthenticationCredentialsNotFoundException exception) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ApiError("UNAUTHORIZED", "请先登录"));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<ApiError> badRequest(IllegalArgumentException exception) {
        return ResponseEntity.badRequest().body(new ApiError("BAD_REQUEST", exception.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception exception, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError("INTERNAL_ERROR", "服务暂时不可用，请稍后重试"));
    }
}
