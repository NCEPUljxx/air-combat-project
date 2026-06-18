package com.aircombat;

import com.aircombat.config.AirCombatProperties;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@MapperScan("com.aircombat.mapper")
@EnableConfigurationProperties(AirCombatProperties.class)
public class AirCombatBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(AirCombatBackendApplication.class, args);
	}

}
