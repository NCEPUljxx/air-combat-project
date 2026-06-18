-- One-shot full reset for course MySQL 8+.
-- Run: mysql -u root -p air_combat < src/main/resources/db/recreate_mysql8.sql
-- Then run schema + seed (from project root, adjust paths):
--   mysql -u root -p air_combat < air-combat-backend/src/main/resources/schema.sql
--   mysql -u root -p air_combat < air-combat-backend/src/main/resources/data.sql

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS battle_player_results;
DROP TABLE IF EXISTS battle_records;
DROP TABLE IF EXISTS room_players;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;
