package com.aircombat.service;

import com.aircombat.config.AirCombatProperties;
import com.aircombat.domain.User;
import com.aircombat.dto.response.AuthResponse;
import com.aircombat.dto.response.UserProfileResponse;
import com.aircombat.mapper.UserMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Objects;
import javax.crypto.SecretKey;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    public static final String MSG_SESSION_SUPERSEDED = "会话已在其它地点登录或已注销，请重新登录";

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final SecretKey jwtKey;
    private final long expireSeconds;

    public AuthService(
        UserMapper userMapper,
        PasswordEncoder passwordEncoder,
        AirCombatProperties airCombatProperties
    ) {
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
        String jwtSecret = airCombatProperties.getAuth().getJwt().getSecret();
        this.jwtKey = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
        this.expireSeconds = airCombatProperties.getAuth().getJwt().getExpireSeconds();
    }

    public UserProfileResponse register(String username, String password, String nickname) {
        String normalizedUsername = validateUsername(username);
        String normalizedPassword = validatePassword(password);
        String normalizedNickname = validateNickname(nickname, normalizedUsername);

        User existing = userMapper.findByUsername(normalizedUsername);
        if (existing != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "用户名已存在");
        }

        User user = new User();
        user.setUsername(normalizedUsername);
        user.setPasswordHash(passwordEncoder.encode(normalizedPassword));
        user.setNickname(normalizedNickname);
        userMapper.insert(user);

        return new UserProfileResponse(user.getId(), user.getUsername(), user.getNickname());
    }

    public AuthResponse login(String username, String password) {
        String normalizedUsername = validateUsername(username);
        String normalizedPassword = validatePassword(password);

        User user = userMapper.findByUsername(normalizedUsername);
        if (user == null || !passwordEncoder.matches(normalizedPassword, user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "用户名或密码错误");
        }

        userMapper.bumpAuthRevision(user.getId());
        User fresh = userMapper.findById(user.getId());
        if (fresh == null || fresh.getAuthRevision() == null) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "登录状态更新失败");
        }

        String token = issueToken(fresh);

        return new AuthResponse(token, new UserProfileResponse(fresh.getId(), fresh.getUsername(), fresh.getNickname()));
    }

    /** 使当前 token 及同账号其它旧 token 立即失效（单点会话） */
    public void logout(String token) {
        SessionUser session = requireUserByToken(token);
        userMapper.bumpAuthRevision(session.userId());
    }

    /**
     * 用于 {@code sendBeacon}（无法携带自定义 Header）。仅校验 JWT 与 auth_revision 后递增。
     */
    public void logoutFromBeacon(String token) {
        if (token == null || token.isBlank()) {
            return;
        }
        try {
            Claims claims = Jwts.parser().verifyWith(jwtKey).build()
                .parseSignedClaims(token.trim())
                .getPayload();
            Long userId = claims.get("uid", Long.class);
            Long tokenArv = readArvClaim(claims);
            if (userId == null || tokenArv == null) {
                return;
            }
            User db = userMapper.findById(userId);
            if (db == null || db.getAuthRevision() == null || !Objects.equals(db.getAuthRevision(), tokenArv)) {
                return;
            }
            userMapper.bumpAuthRevision(userId);
        } catch (JwtException | IllegalArgumentException ex) {
            log.debug("beacon logout: invalid token", ex);
        }
    }

    public SessionUser requireUserByToken(String token) {
        if (token == null || token.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "缺少登录 token");
        }
        try {
            Claims claims = Jwts.parser().verifyWith(jwtKey).build()
                .parseSignedClaims(token)
                .getPayload();
            Long userId = claims.get("uid", Long.class);
            String username = claims.getSubject();
            String nickname = claims.get("nickname", String.class);
            Long tokenArv = readArvClaim(claims);
            if (userId == null || username == null || nickname == null) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "token 内容不完整");
            }
            if (tokenArv == null) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "token 已失效，请重新登录");
            }
            User db = userMapper.findById(userId);
            if (db == null || db.getAuthRevision() == null || !Objects.equals(db.getAuthRevision(), tokenArv)) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, MSG_SESSION_SUPERSEDED);
            }
            return new SessionUser(userId, username, nickname);
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (JwtException | IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "token 无效或已过期");
        }
    }

    private static Long readArvClaim(Claims claims) {
        Object raw = claims.get("arv");
        if (raw instanceof Number number) {
            return number.longValue();
        }
        return null;
    }

    private String issueToken(User user) {
        Instant now = Instant.now();
        Instant expireAt = now.plusSeconds(expireSeconds);
        return Jwts.builder()
            .subject(user.getUsername())
            .claim("uid", user.getId())
            .claim("nickname", user.getNickname())
            .claim("arv", user.getAuthRevision())
            .issuedAt(Date.from(now))
            .expiration(Date.from(expireAt))
            .signWith(jwtKey)
            .compact();
    }

    private String validateUsername(String username) {
        if (username == null || username.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "username 不能为空");
        }
        String normalized = username.trim();
        if (normalized.length() < 3 || normalized.length() > 50) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "username 长度需在 3-50");
        }
        return normalized;
    }

    private String validatePassword(String password) {
        if (password == null || password.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "password 不能为空");
        }
        if (password.length() < 6 || password.length() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "password 长度需在 6-100");
        }
        return password;
    }

    private String validateNickname(String nickname, String fallback) {
        String normalized = (nickname == null || nickname.isBlank()) ? fallback : nickname.trim();
        if (normalized.length() > 50) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "nickname 不能超过 50 字符");
        }
        return normalized;
    }

    public record SessionUser(Long userId, String username, String nickname) {
    }
}
