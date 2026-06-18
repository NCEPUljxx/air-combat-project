CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    nickname VARCHAR(50) NOT NULL,
    auth_revision BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_username (username)
);

CREATE TABLE IF NOT EXISTS rooms (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(80) NOT NULL,
    owner_user_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'WAITING',
    red_count INT DEFAULT 0,
    blue_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rooms_status (status)
);

CREATE TABLE IF NOT EXISTS room_players (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    room_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    team VARCHAR(10) NOT NULL,
    fighter_id VARCHAR(50),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (room_id, user_id),
    INDEX idx_room_players_room_team (room_id, team)
);

CREATE TABLE IF NOT EXISTS battle_records (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    room_id BIGINT,
    mode VARCHAR(20) NOT NULL,
    winner VARCHAR(10) NOT NULL,
    duration_seconds INT NOT NULL,
    red_kills INT DEFAULT 0,
    blue_kills INT DEFAULT 0,
    report_json LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_battle_records_room_id (room_id)
);

CREATE TABLE IF NOT EXISTS battle_player_results (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    battle_record_id BIGINT NOT NULL,
    room_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    nickname VARCHAR(50) NOT NULL,
    team VARCHAR(10) NOT NULL,
    fighter_model VARCHAR(64) NOT NULL,
    kills INT NOT NULL DEFAULT 0,
    damage_dealt INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_bpr_battle_record (battle_record_id),
    INDEX idx_bpr_room (room_id)
);
