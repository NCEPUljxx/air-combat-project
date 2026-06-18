package com.aircombat.mapper;

import com.aircombat.domain.BattleRecord;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface BattleRecordMapper {

    @Insert("""
        INSERT INTO battle_records(room_id, mode, winner, duration_seconds, red_kills, blue_kills, report_json)
        VALUES(#{roomId}, #{mode}, #{winner}, #{durationSeconds}, #{redKills}, #{blueKills}, #{reportJson})
        """)
    @Options(useGeneratedKeys = true, keyProperty = "id", keyColumn = "id")
    int insert(BattleRecord record);

    @Select("""
        SELECT id, room_id, mode, winner, duration_seconds, red_kills, blue_kills, report_json, created_at
        FROM battle_records
        WHERE id = #{id}
        """)
    BattleRecord findById(Long id);

    @Select("""
        SELECT id, room_id, mode, winner, duration_seconds, red_kills, blue_kills, report_json, created_at
        FROM battle_records
        WHERE room_id = #{roomId}
        ORDER BY id DESC
        """)
    List<BattleRecord> findByRoomId(Long roomId);

    @Select("""
        SELECT id, room_id, mode, winner, duration_seconds, red_kills, blue_kills, report_json, created_at
        FROM battle_records
        WHERE room_id = #{roomId} AND mode = 'ONLINE'
        ORDER BY id DESC
        LIMIT 1
        """)
    BattleRecord findLatestOnlineByRoomId(Long roomId);

    @Select("""
        SELECT id, room_id, mode, winner, duration_seconds, red_kills, blue_kills, report_json, created_at
        FROM battle_records
        WHERE room_id = #{roomId} AND mode = 'ONLINE'
        ORDER BY id DESC
        LIMIT #{limit}
        """)
    List<BattleRecord> findOnlineBattlesForRoom(@Param("roomId") Long roomId, @Param("limit") int limit);

    /**
     * Online battles where the user appears in battle_player_results, newest first.
     */
    @Select("""
        SELECT DISTINCT br.id, br.room_id, br.mode, br.winner, br.duration_seconds, br.red_kills,
        br.blue_kills, br.report_json, br.created_at
        FROM battle_records br
        INNER JOIN battle_player_results bpr ON bpr.battle_record_id = br.id AND bpr.user_id = #{userId}
        WHERE br.mode = 'ONLINE'
        ORDER BY br.created_at DESC, br.id DESC
        LIMIT #{limit}
        """)
    List<BattleRecord> findOnlineBattlesForUser(@Param("userId") Long userId, @Param("limit") int limit);

    /** All recent ONLINE battles (global feed). */
    @Select("""
        SELECT id, room_id, mode, winner, duration_seconds, red_kills, blue_kills, report_json, created_at
        FROM battle_records
        WHERE mode = 'ONLINE'
        ORDER BY id DESC
        LIMIT #{limit}
        """)
    List<BattleRecord> findOnlineBattlesGlobally(@Param("limit") int limit);
}
