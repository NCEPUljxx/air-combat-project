package com.aircombat.mapper;

import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SystemMapper {

    Integer ping();
}
