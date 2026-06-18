-- One-shot DDL refactor for legacy air_combat DB (MySQL 8+).
-- Run with mysql CLI (recommended), not Spring `schema.sql` (uses DELIMITER):
--   mysql -u root -p air_combat < src/main/resources/db/refactor_from_legacy_mysql8.sql
--
USE air_combat;

DELIMITER //

DROP PROCEDURE IF EXISTS air_internal_refactor_legacy//
CREATE PROCEDURE air_internal_refactor_legacy()
BEGIN
  IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'battle_records'
      AND COLUMN_NAME = 'avg_fps'
  ) THEN
    ALTER TABLE battle_records DROP COLUMN avg_fps;
  END IF;
END//
DELIMITER ;

CALL air_internal_refactor_legacy();
DROP PROCEDURE IF EXISTS air_internal_refactor_legacy;

-- Match current application schema (fighter / display strings)
ALTER TABLE battle_player_results
  MODIFY COLUMN fighter_model VARCHAR(64) NOT NULL DEFAULT '';
