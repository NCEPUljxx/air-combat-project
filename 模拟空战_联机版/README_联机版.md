# 模拟空战 · 联机版

[Vue](https://vuejs.org/) · [TypeScript](https://www.typescriptlang.org/) · [Vite](https://vitejs.dev/) · [Spring Boot](https://spring.io/projects/spring-boot) · [MyBatis](https://mybatis.org/) · [MySQL](https://www.mysql.com/)

**联机对战** 模式：前端 Vue 3 + Canvas 渲染，后端 Spring Boot 3 + MyBatis + MySQL，WebSocket 实时同步，REST 账号与房间管理。

---

## 目录

- [模拟空战 · 联机版](#模拟空战--联机版)
  - [目录](#目录)
  - [功能概览](#功能概览)
  - [技术栈](#技术栈)
  - [环境要求](#环境要求)
  - [快速启动](#快速启动)
    - [1. 启动后端](#1-启动后端)
    - [2. 启动前端](#2-启动前端)
    - [3. 多设备联机](#3-多设备联机)
  - [目录结构](#目录结构)
  - [操作说明](#操作说明)
    - [键鼠](#键鼠与本项目单机版一致)
    - [胜负判定](#胜负判定)
    - [游戏规则](#游戏规则)
  - [联机流程](#联机流程)
    - [关键流程说明](#关键流程说明)
  - [REST API](#rest-api)
  - [WebSocket 协议](#websocket-协议)
    - [连接地址](#连接地址)
    - [上行（客户端 → 服务器）](#上行客户端--服务器)
    - [下行（服务器 → 客户端）](#下行服务器--客户端)
    - [连接关闭码（私有，4000+）](#连接关闭码私有4000)
  - [性能要点](#性能要点)
    - [后端](#后端)
    - [前端](#前端)
  - [双浏览器演示](#双浏览器演示)
  - [常见问题](#常见问题)
  - [AI 辅助开发说明](#ai-辅助开发说明)

---

## 功能概览

| 类别 | 内容 |
|------|------|
| 账号 | 注册、登录、JWT 鉴权；单点登录互踢；关闭页签自动注销 |
| 房间 | 创建/加入/选队（RED/BLUE）/选机型/离开；房主解散；超时过期；大厅自动轮询刷新 |
| 战斗 | 后端 120 tick/s 权威推进；导弹追踪/炸弹 AOE/战机碰撞；双方 AWACS 雷达探测；AI 随机机型与概率炸弹 |
| 同步 | WebSocket `/ws/game`；前端上行 `MSG_PLAYER_INPUT`，后端广播 `MSG_BATTLE_STATUS`（`BattleSnapshot`） |
| 断线 | 离线玩家战机自动 AI 接管 |
| 胜负 | 以**击落**对方可计数战机为准（排除 AWACS）；后端判定后广播 `BATTLE_FINISHED` |
| 战报 | 对局结果自动入库（`battle_records` + `battle_player_results`）；支持房间/个人历史查询 |
| 性能 | HUD 实时 FPS；后端双线程池（`gameTaskExecutor` + `calculationTaskExecutor`） |

---

## 技术栈

| 端 | 层级 | 技术 |
|----|------|------|
| 前端 | View | Vue 3、Vite |
| 前端 | Controller | TypeScript、`OnlineGameController`、`normalizeBattleSnapshot` |
| 前端 | Model | TypeScript（`interfaces.ts`、`types.ts`、`JsonNetworkProtocol.ts`） |
| 前端 | 渲染 | Canvas 2D（离屏缓冲、脏矩形、小地图节流） |
| 后端 | View/Display | REST 控制器、`GameWebSocketHandler` |
| 后端 | Service | `OnlineGameService`（tick 调度）、`RoomService`、`AuthService` |
| 后端 | Model/Domain | MyBatis 实体与 Mapper、`BattleSnapshot`、`InputCommand` 等 record |
| 后端 | ORM/持久化 | MyBatis（Mapper 接口 + XML，将 Java 对象映射到 MySQL） |
| 后端 | 通信 | WebSocket（`/ws/game`）、REST（`/api/*`） |
| 后端 | 并发 | `ScheduledExecutorService`（tick 调度）、`ThreadPoolTaskExecutor`×2（游戏/计算） |
| 数据库 | 存储 | MySQL（`air_combat` 库，5 张表） |

---

## 环境要求

- **Node.js 18+**、npm
- **Java 17+**、Maven（可用 `mvnw`）
- **MySQL**（需与 `application.yml` 中 JDBC 配置一致）
- 浏览器推荐 **Chrome** 或 **Edge**

---

## 快速启动

### 启动后端

确保 MySQL 已运行，库名、用户名、密码与 `air-combat-backend/src/main/resources/application.yml` 一致：

```powershell
cd air-combat-backend
.\mvnw.cmd spring-boot:run
```

- 后端默认 `http://localhost:8080`
- 健康检查：`GET http://localhost:8080/api/health`
- 首次启动会自动建表（`schema.sql`）并初始化示例数据

### 启动前端

```bash
cd air-combat-frontend
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`。

### 多设备联机

前端登录页的「后端地址」填写运行后端的机器局域网 IP（如 `http://192.168.x.x:8080`），其他设备访问前端 `http://<前端IP>:5173` 即可联机。

---

## 目录结构

```text
模拟空战_联机版/
├── README_联机版.md              # 本文件
├── 实验报告_联机模式.md            # 作业报告
├── screenshots/                  # 报告用截图
├── air-combat-frontend/
│   ├── package.json
│   ├── src/
│   │   ├── controllers/          # OnlineGameController、InputController 等
│   │   ├── game/                 # interfaces.ts、types.ts、JsonNetworkProtocol.ts
│   │   ├── rendering/            # GameRenderer（复用单机渲染层）
│   │   ├── views/                # LoginView、RoomView、OnlineGameView
│   │   ├── components/           # BattleCanvas.vue、GameHud.vue
│   │   ├── api/                  # REST 客户端（authApi、roomApi）
│   │   ├── stores/               # authStore、roomStore（ref 响应式状态）
│   │   └── shared/               # battlefieldConfig.ts、onlineGameConfig.ts
│   └── dist/                     # npm run build 产物
└── air-combat-backend/
    ├── pom.xml
    ├── mvnw.cmd
    └── src/main/
        ├── java/com/aircombat/
        │   ├── AirCombatBackendApplication.java
        │   ├── config/           # CorsConfig、WebSocketConfig、ThreadPoolConfig 等
        │   ├── controller/       # AuthController、RoomController、BattlesController
        │   ├── display/          # GameWebSocketHandler、HealthController
        │   ├── service/          # OnlineGameService、RoomService、AuthService
        │   ├── game/             # BattleSnapshot、InputCommand、MessageType 等
        │   ├── domain/           # User、Room、RoomPlayer、BattleRecord 等实体
        │   ├── dto/              # 请求/响应 DTO
        │   └── mapper/           # MyBatis Mapper 接口
        └── resources/
            ├── application.yml
            ├── schema.sql
            └── mapper/           # Mapper XML
```

---

## 操作说明

### 键鼠（与本项目单机版一致）

| 操作 | 按键 |
|------|------|
| 移动 / 转向 | `W` `A` `S` `D` 或方向键 |
| 机头朝向 | 鼠标移动 |
| 空空导弹 | `J`、**空格**、**鼠标左键** |
| 投弹 | `K`、**鼠标右键** |

### 胜负判定

- 某方可计数战机全部被击落 → 对方获胜
- 双方同时全灭 → 平局
- KJ-500 预警机**不参与**胜负计数
- 胜负由后端权威判定，通过 `BATTLE_FINISHED` 事件通知前端

### 游戏规则

- 世界 3600×2160，视口 1200×720，相机跟随玩家战机
- 4 种机型（J-20 / J-16 / J-10C / J-25），速度/HP/弹药/伤害各异
- 蓝方 AI 属性 ×0.7（血量、速度、载弹、伤害等弱化）
- 双方各 1 架 KJ-500 预警机，跟随己方存活友机重心；雷达仅 AWACS 提供（范围随 HP 缩放，最大 900）
- 导弹：在己方 AWACS 探测区内持续追踪，区外直飞
- 炸弹：飞行 3s 或近距碰撞触发 AOE 爆炸
- 战机碰撞：双方各扣最大血量 50%，60 tick 冷却

---

## 联机流程

```
注册/登录 → 房间大厅 → 创建/加入房间 → 选队(RED/BLUE) → 选机型 → 等待玩家
    → 房主点击"开始对局" → 3 秒倒计时(全员蒙层) → 进入战场 → WebSocket 实时对战
    → 一方全灭 → BATTLE_FINISHED → 战报入库 → 可查询对战历史
```

### 关键流程说明

1. **房间大厅**：每 3 秒自动轮询刷新；只显示 WAITING / RUNNING 状态房间
2. **选机型**：房内每位玩家可通过下拉菜单选择 J-20 / J-16 / J-10C / J-25，后端在创建战机时使用所选机型的属性
3. **开始倒计时**：只有房主可点"开始对局"；点击后后端广播 `MATCH_COUNTDOWN`（3 秒），前端全员显示全屏倒计时蒙层；倒计时结束广播 `BATTLE_STARTED`，自动进入战场
4. **WebSocket 连接**：`OnlineGameController` 在收到 `BATTLE_STARTED` 后连接 `/ws/game`，`onopen` 时 attach 画布，保证鼠标瞄准挂载可靠
5. **战场同步**：前端每帧（约 120Hz）上行 `MSG_PLAYER_INPUT`，后端 120 tick/s 计算并广播 `MSG_BATTLE_STATUS`
6. **断线处理**：玩家 WebSocket 断开后，其战机自动切换为 AI 控制；重连时新 WebSocket 替换旧连接（旧连接收到 `4000 SESSION_REPLACED`）
7. **对局结束**：后端广播 `BATTLE_FINISHED`（含战报 ID、胜负、击杀等），战报入库；房间状态回到 WAITING，可开始下一局

---

## REST API

请求头登录态：`X-Token: <JWT>`（注册/登录除外）。

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/auth/register` | 注册（username / password / nickname） |
| `POST` | `/api/auth/login` | 登录，返回 JWT token |
| `POST` | `/api/auth/logout` | 注销，递增 `auth_revision` 使旧 token 失效 |
| `POST` | `/api/auth/logout-beacon` | 关闭页签时 `sendBeacon` 尽力注销（urlencoded body） |
| `GET` | `/api/rooms` | 房间列表 |
| `GET` | `/api/rooms/{id}` | 房间详情（含玩家列表与队伍人数） |
| `POST` | `/api/rooms` | 创建房间 |
| `POST` | `/api/rooms/{id}/join` | 加入房间（指定 RED/BLUE） |
| `POST` | `/api/rooms/{id}/team` | 切换队伍 |
| `POST` | `/api/rooms/{id}/leave` | 离开房间（房主离开 → 房间解散 + 踢出全部 WebSocket） |
| `POST` | `/api/rooms/{id}/start` | 房主开始对局 |
| `PUT` | `/api/rooms/{id}/model` | 选择机型（J-20 / J-16 / J-10C / J-25） |
| `GET` | `/api/rooms/{id}/battle-history` | 房间对战历史 |
| `GET` | `/api/battles/my-history?limit=50` | 个人对战历史 |

---

## WebSocket 协议

### 连接地址

```
ws://localhost:8080/ws/game?token=<JWT>&roomId=<数字>
```

### 上行（客户端 → 服务器）

| 消息类型 | 说明 | payload |
|----------|------|---------|
| `MSG_PLAYER_INPUT` | 玩家输入 | `InputCommand{moveX, moveY, fire, fireBomb, targetId, fireHeading, fireBombHeading}` |

### 下行（服务器 → 客户端）

| 消息类型 | 说明 | payload |
|----------|------|---------|
| `MSG_BATTLE_STATUS` | 每 tick 全量战场快照 | `BattleSnapshot{roomId, tick, status, fighters, missiles, bombs, radarMarks, damagePopups, redAlive, blueAlive, battleElapsedMs}` |
| `MSG_MISSILE_LAUNCH` | 导弹发射事件 | `List<MissileState>` |
| `MSG_HIT_RESULT` | 命中结果 | `List<{missileId, fighterId, damage, destroyed}>` |
| `MSG_ROOM_EVENT` | 房间事件 | `{event, payload}` — 事件类型：`PLAYER_ONLINE/OFFLINE`、`MATCH_COUNTDOWN`、`BATTLE_STARTED`、`BATTLE_FINISHED`、`ROOM_EXPIRED` |
| `MSG_ERROR` | 错误通知 | `{message}` |

### 连接关闭码（私有，4000+）

| 码 | 含义 |
|----|------|
| `4000` | `SESSION_REPLACED` — 新 WebSocket 替换了旧连接 |
| `4001` | `AUTH_REVOKED` — `auth_revision` 已变更（被新登录踢下线） |

---

## 性能要点

### 后端

- **tick 调度**：单线程 `ScheduledExecutorService`（守护线程）按 120Hz 投递任务，自身仅做调度不做计算
- **`gameTaskExecutor`**：核心 4 / 最大 8 线程，队列 200；执行每个房间的 `tick()`，`synchronized(runtime)` 保证同房间串行
- **`calculationTaskExecutor`**：核心 4 / 最大 8 线程，队列 400；异步执行 AI 决策（`buildAiCommands`）与碰撞检测（`detectHits`、`scanRadarMarks`）
- **pending 意图**：`pendingMissileByFighter` / `pendingBombByFighter` 避免高频率输入覆盖导致开火丢失
- **`auth_revision` 节流**：每 20 条输入或每 2s 校验一次，避免每条消息查库

### 前端

- 联机模式 `BattleCanvas` 开启 `continuousRafRender`，快照间歇仍按显示刷新重绘（上限 120 FPS）
- `normalizeBattleSnapshot` 将后端平铺结构转为前端渲染友好的结构
- 复用单机的离屏缓冲、脏矩形、Path2D 缓存等渲染优化

---

## 双浏览器演示

1. 确认 MySQL 与 `application.yml` 一致后启动后端、前端
2. 两个浏览器（或同一浏览器两个窗口/隐身模式）各注册一个账号并登录
3. 用户 A 创建房间 → 用户 B 加入同一房间、**不同队伍**
4. 各自选择机型
5. 房主点击"开始对局" → 3 秒倒计时 → 两窗口进入战场
6. 观察同步、FPS、昵称显示、AWACS 雷达

---

## 常见问题

| 现象 | 处理 |
|------|------|
| 后端启动失败 | 检查 MySQL 是否运行；`application.yml` 中 JDBC URL、用户名、密码是否正确 |
| 联机登录失败 | 确认后端地址正确（本机 `http://localhost:8080`）且后端已启动 |
| 房间列表为空 | 正常；创建房间后自动显示；大厅每 3 秒自动刷新 |
| 倒计时后进不去战场 | 确保两个玩家都在房内且选择了不同队伍；刷新页面重试 |
| 画布白屏/报错 | 检查浏览器控制台；确保 `damagePopups` 规范化未失败 |
| WebSocket 频繁断开 | 检查网络；可能被新登录踢下线（4001）或替换连接（4000） |
| 端口占用 | 后端 `server.port` 在 `application.yml`；前端 `vite.config.ts` 中修改 |

---

## AI 辅助开发说明

本项目 **源代码与文档的初稿主要借助 Cursor IDE 中的 GPT 类大模型辅助生成**。本人负责 **整体架构与分层设计**、接口与边界约定；对生成结果进行 **修改、裁剪与本地化调试**（含环境与构建问题、MySQL 建库、前后端联调、多浏览器验证）；并在提交与答辩前完成 **理解与核对**。

