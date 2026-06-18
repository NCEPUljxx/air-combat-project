package com.aircombat.dto.response;

public record AuthResponse(String token, UserProfileResponse user) {
}
