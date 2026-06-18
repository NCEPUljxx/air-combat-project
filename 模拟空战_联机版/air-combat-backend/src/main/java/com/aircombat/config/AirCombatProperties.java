package com.aircombat.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "air-combat")
public class AirCombatProperties {

    private Game game = new Game();
    private Auth auth = new Auth();

    public Game getGame() {
        return game;
    }

    public void setGame(Game game) {
        this.game = game;
    }

    public Auth getAuth() {
        return auth;
    }

    public void setAuth(Auth auth) {
        this.auth = auth;
    }

    public static class Game {

        /** Server tick rate (Hz). */
        private int tickRate = 30;
        private int maxTeamSize = 4;

        public int getTickRate() {
            return tickRate;
        }

        public void setTickRate(int tickRate) {
            this.tickRate = tickRate;
        }

        public int getMaxTeamSize() {
            return maxTeamSize;
        }

        public void setMaxTeamSize(int maxTeamSize) {
            this.maxTeamSize = maxTeamSize;
        }
    }

    public static class Auth {

        private Jwt jwt = new Jwt();

        public Jwt getJwt() {
            return jwt;
        }

        public void setJwt(Jwt jwt) {
            this.jwt = jwt;
        }

        public static class Jwt {

            private String secret;
            private long expireSeconds = 86400L;

            public String getSecret() {
                return secret;
            }

            public void setSecret(String secret) {
                this.secret = secret;
            }

            public long getExpireSeconds() {
                return expireSeconds;
            }

            public void setExpireSeconds(long expireSeconds) {
                this.expireSeconds = expireSeconds;
            }
        }
    }
}
