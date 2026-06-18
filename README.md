# 模拟空战 · 课程项目

软件体系结构课程综合实践作业：顶视海空战场空战仿真，支持 **单机本地推演** 与 **联机多人对战**。

---

## 项目结构

```
├── README.md                          ← 本文件
├── 模拟空战_单机版/                     ← 单机完整副本
│   ├── README_单机版.md                → 单机说明（启动、操作、架构）
│   ├── 实验报告_单机模式.md / .pdf      → 单机实验报告
│   ├── 讲解发言稿.md                   → 答辩讲稿
│   ├── air-combat-frontend/           → Vue 3 + TypeScript + Canvas 源码
│   └── screenshots/                   → 报告截图
│
└── 模拟空战_联机版/                     ← 联机完整副本
    ├── README_联机版.md                → 联机说明（启动、API、协议）
    ├── 实验报告_联机模式.md / .pdf      → 联机实验报告
    ├── 讲解发言稿.md                   → 答辩讲稿
    ├── air-combat-backend/            → Spring Boot 3 + MyBatis 源码
    ├── screenshots/                   → 报告截图 + 架构图
    └── 答辩手册_技术栈与架构.md         → 代码导读与答辩参考
```

## 技术栈

| 模块 | 技术 |
|------|------|
| 单机版 | Vue 3 · TypeScript · Vite · Canvas 2D |
| 联机版-前端 | 同上 + WebSocket |
| 联机版-后端 | Spring Boot 3 · MyBatis · MySQL · WebSocket |
| 鉴权 | JWT（jjwt）· BCrypt · auth_revision 单点互踢 |

## 快速启动

详见各子目录的 README：

- **单机版**：[模拟空战_单机版/README_单机版.md](模拟空战_单机版/README_单机版.md) — `npm install && npm run dev`
- **联机版**：[模拟空战_联机版/README_联机版.md](模拟空战_联机版/README_联机版.md) — 需 MySQL + 后端 `mvnw spring-boot:run` + 前端 `npm run dev`
