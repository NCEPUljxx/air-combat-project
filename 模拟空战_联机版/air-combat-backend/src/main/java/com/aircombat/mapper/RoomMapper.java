package com.aircombat.mapper;

import com.aircombat.domain.Room;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface RoomMapper {

    @Insert("""
        INSERT INTO rooms(name, owner_user_id, status, red_count, blue_count)
        VALUES(#{name}, #{ownerUserId}, #{status}, #{redCount}, #{blueCount})
        """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(Room room);

    @Select("""
        SELECT id, name, owner_user_id, status, red_count, blue_count, created_at
        FROM rooms
        WHERE id = #{id}
        """)
    Room findById(Long id);

    @Select("""
        SELECT id, name, owner_user_id, status, red_count, blue_count, created_at
        FROM rooms
        WHERE status IN ('WAITING', 'RUNNING')
        ORDER BY id DESC
        """)
    List<Room> findAll();

    @Select("""
        SELECT id FROM rooms
        WHERE status IN ('WAITING', 'RUNNING')
          AND created_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
        """)
    List<Long> findStaleActiveRoomIds();

    @Update("""
        UPDATE rooms
        SET red_count = #{redCount}, blue_count = #{blueCount}
        WHERE id = #{roomId}
        """)
    int updateCounts(@Param("roomId") Long roomId, @Param("redCount") int redCount, @Param("blueCount") int blueCount);

    @Update("""
        UPDATE rooms
        SET status = #{status}
        WHERE id = #{roomId}
        """)
    int updateStatus(@Param("roomId") Long roomId, @Param("status") String status);
}
