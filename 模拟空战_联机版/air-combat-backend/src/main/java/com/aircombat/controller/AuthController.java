package com.aircombat.controller;

import com.aircombat.dto.request.LoginRequest;
import com.aircombat.dto.request.RegisterRequest;
import com.aircombat.dto.response.AuthResponse;
import com.aircombat.dto.response.UserProfileResponse;
import com.aircombat.service.AuthService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.HttpStatus;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final String TOKEN_HEADER = "X-Token";

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public Map<String, Object> register(@RequestBody RegisterRequest request) {
        UserProfileResponse user = authService.register(request.username(), request.password(), request.nickname());
        return Map.of("success", true, "user", user);
    }

    @PostMapping("/login")
    public AuthResponse login(@RequestBody LoginRequest request) {
        return authService.login(request.username(), request.password());
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestHeader(TOKEN_HEADER) String token) {
        authService.logout(token);
    }

    /** 关闭标签页时 sendBeacon 无法带 X-Token，使用 urlencoded body: token=... */
    @PostMapping(value = "/logout-beacon", consumes = "application/x-www-form-urlencoded")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logoutBeacon(@RequestParam("token") String token) {
        authService.logoutFromBeacon(token);
    }
}
