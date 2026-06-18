package com.aircombat.mapper;

import com.aircombat.domain.User;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface UserMapper {

    @Insert("""
        INSERT INTO users(username, password_hash, nickname)
        VALUES(#{username}, #{passwordHash}, #{nickname})
        """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(User user);

    @Select("""
        SELECT id, username, password_hash, nickname, auth_revision, created_at
        FROM users
        WHERE username = #{username}
        """)
    User findByUsername(String username);

    @Select("""
        SELECT id, username, password_hash, nickname, auth_revision, created_at
        FROM users
        WHERE id = #{id}
        """)
    User findById(Long id);

    @Update("UPDATE users SET auth_revision = auth_revision + 1 WHERE id = #{userId}")
    int bumpAuthRevision(@Param("userId") Long userId);
}
