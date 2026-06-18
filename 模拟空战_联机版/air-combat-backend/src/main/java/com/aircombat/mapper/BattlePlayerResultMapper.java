package com.aircombat.mapper;

import com.aircombat.domain.BattlePlayerResult;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface BattlePlayerResultMapper {

    @Insert("""
        INSERT INTO battle_player_results(battle_record_id, room_id, user_id, nickname, team, fighter_model, kills, damage_dealt)
        VALUES(#{battleRecordId}, #{roomId}, #{userId}, #{nickname}, #{team}, #{fighterModel}, #{kills}, #{damageDealt})
        """)
    int insert(BattlePlayerResult row);

    @Select("""
        SELECT id, battle_record_id, room_id, user_id, nickname, team, fighter_model, kills, damage_dealt, created_at
        FROM battle_player_results
        WHERE battle_record_id = #{battleRecordId}
        ORDER BY team ASC, user_id ASC
        """)
    List<BattlePlayerResult> findByBattleRecordId(@Param("battleRecordId") Long battleRecordId);

    @Select("""
        SELECT COUNT(*) FROM battle_player_results
        WHERE battle_record_id = #{battleRecordId} AND user_id = #{userId}
        """)
    int countByBattleAndUser(@Param("battleRecordId") Long battleRecordId, @Param("userId") Long userId);
}
