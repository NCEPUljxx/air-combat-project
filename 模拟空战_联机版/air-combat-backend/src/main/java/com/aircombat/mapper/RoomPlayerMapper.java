package com.aircombat.mapper;

import com.aircombat.domain.RoomPlayer;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface RoomPlayerMapper {

    @Insert("""
        INSERT INTO room_players(room_id, user_id, team, fighter_id)
        VALUES(#{roomId}, #{userId}, #{team}, #{fighterId})
        """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(RoomPlayer roomPlayer);

    @Select("""
        SELECT id, room_id, user_id, team, fighter_id, joined_at
        FROM room_players
        WHERE room_id = #{roomId}
        ORDER BY id ASC
        """)
    List<RoomPlayer> findByRoomId(Long roomId);

    @Select("""
        SELECT id, room_id, user_id, team, fighter_id, joined_at
        FROM room_players
        WHERE room_id = #{roomId} AND user_id = #{userId}
        """)
    RoomPlayer findByRoomAndUser(@Param("roomId") Long roomId, @Param("userId") Long userId);

    @Update("""
        UPDATE room_players
        SET team = #{team}, fighter_id = #{fighterId}
        WHERE room_id = #{roomId} AND user_id = #{userId}
        """)
    int updateTeam(
        @Param("roomId") Long roomId,
        @Param("userId") Long userId,
        @Param("team") String team,
        @Param("fighterId") String fighterId
    );

    @Delete("""
        DELETE FROM room_players
        WHERE room_id = #{roomId} AND user_id = #{userId}
        """)
    int deleteByRoomAndUser(@Param("roomId") Long roomId, @Param("userId") Long userId);

    @Delete("""
        DELETE FROM room_players
        WHERE room_id = #{roomId}
        """)
    int deleteAllByRoomId(@Param("roomId") Long roomId);

    @Select("""
        SELECT COUNT(1)
        FROM room_players
        WHERE room_id = #{roomId} AND team = #{team}
        """)
    int countByRoomAndTeam(@Param("roomId") Long roomId, @Param("team") String team);
}
