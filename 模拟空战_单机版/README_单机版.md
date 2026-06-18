# 模拟空战 · 单机版

[Vue](https://vuejs.org/)
[TypeScript](https://www.typescriptlang.org/)
[Vite](https://vitejs.dev/)

顶视 **海空战场** Web 单机演示：**红方** 玩家战斗机 + **空警类预警（AWACS）** 探测；**蓝方** 4～12 架 AI 敌机。**全部战局推演在浏览器内完成**，无需 MySQL / Spring Boot。

---

## 目录

- [功能概览](#功能概览)
- [技术栈](#技术栈)
- [环境与快速开始](#环境与快速开始)
- [静态资源部署（请勿只双击 HTML）](#静态资源部署请勿只双击-html)
- [操作说明](#操作说明)
- [目录结构](#目录结构)
- [与任务书的对应](#与任务书的对应)
- [性能与设计要点](#性能与设计要点)
- [常见问题](#常见问题)
- [相关文档](#相关文档)

---

## 功能概览


| 类别  | 内容                        |
| --- | ------------------------- |
| 战场  | 顶视海空场景、摄像机随动              |
| 单位  | 红方玩家战机 + AWACS；蓝方多机 AI    |
| 战斗  | 空空导弹导引、命中后敌机退场；界面显示剩余架数   |
| 探测  | AWACS / 战斗机雷达差异；敌情标记      |
| 胜负  | 以 **击落** 可计数战机为主（见下文说明）   |
| 性能  | HUD **实时 FPS**；碰撞与渲染优化见下文 |


---

## 技术栈


| 层级  | 技术                                 | 说明                                       |
| --- | ---------------------------------- | ---------------------------------------- |
| 视图  | Vue 3、Vite                         | 画布、HUD、路由                                |
| 控制器 | TypeScript、`requestAnimationFrame` | `LocalGameController` 游戏循环               |
| 模型  | TypeScript                         | `Battlefield`、战机/导弹、`interfaces.ts` 六大接口 |
| 渲染  | Canvas 2D                          | 离屏缓冲、脏矩形、外形缓存                            |


---

## 环境与快速开始

**需要：** Node.js **18+**、npm；浏览器推荐 **Chrome** 或 **Edge**。

```bash
cd air-combat-frontend
npm install
npm run dev
```

终端会打印本地地址（多为 `http://localhost:5173`）。浏览器打开 → 首页 → **进入单机模式**。

---

## 静态资源部署（请勿只双击 HTML）

单机交付需先 **构建**，再用 **HTTP** 访问产物（直接用 `file://` 打开 `index.html` 往往白屏或资源 404）。

**方式 A：`npm run preview`（推荐，需 Node）**

```bash
cd air-combat-frontend
npm install
npm run build
npm run preview
```

按终端提示打开（多为 `http://localhost:4173`）。

**方式 B：Python 静态服务（先有 `dist/` 时）**

1. **必须**已通过 `npm run build` 生成 `air-combat-frontend/dist/`（内含 `index.html` 与 `assets/`）。
2. 在该目录启动服务：
  ```bash
   cd air-combat-frontend/dist
   python -m http.server 8080
  ```
   Windows 上若 `python` 不可用，尝试 `py -3 -m http.server 8080`。
3. 浏览器访问 `http://127.0.0.1:8080/`（端口冲突可改为例如 `8090`）。

要点：**在 `dist` 目录下** 启动命令；不要使用 `file://` 作为主要验收路径。

---

## 操作说明

### 流程

启动应用 → **首页**（难度 / 机型等）→ **进入单机模式** → `GameView` 战斗界面。

### 键鼠（以本仓库实现为准）

任务书示例中可能出现的 Tab 切机、右键选敌、滚轮缩放等，**与本实现不完全一致**；课堂与批改请以 **本节 + 源码** 为准。


| 操作         | 本实现                  |
| ---------- | -------------------- |
| 移动 / 转向    | `W` `A` `S` `D` 或方向键 |
| 机头朝向       | 鼠标移动                 |
| 空空导弹       | `J`、**空格**、**鼠标左键**  |
| 投弹（非任务书必选） | `K`、**鼠标右键**         |


---

## 目录结构

```text
模拟空战_单机版/
├── README_单机版.md          # 本文件
├── 实验报告_单机模式.pdf       # 作业报告 
├── 单机版视频.mp4             # 项目讲解视频
└── air-combat-frontend/
    ├── package.json
    ├── src/
    │   ├── controllers/      # LocalGameController 等
    │   ├── game/             # Battlefield、interfaces
    │   ├── rendering/        # GameRenderer
    │   └── components/       # Vue 画布组件
    └── dist/                  # npm run build 后生成
```

---

## 与任务书的对应


| 关注点          | 单机实现提要                                                        |
| ------------ | ------------------------------------------------------------- |
| 分层 / MVC     | View（Vue）↔ Controller（输入 + 循环）↔ Model（战场与实体）；View **不直连**可变模型 |
| 接口先行         | `IFighter`、`IMissile`、`IRadarSystem` 等与 `implements`          |
| FPS          | HUD 实时显示                                                      |
| 导弹 / 胜负 / 架数 | `Battlefield`、`CombatJudger`、状态 UI                            |
| 网络协议预留       | `INetworkProtocol` 与消息类型；**单机不连 WS**                          |
| AI           | 敌机单机侧简化 AI                                                    |


---

## 性能与设计要点

- 渲染：**离屏 Canvas**、HUD 等区域 **脏矩形**、机身等 **Path2D** 缓存  
- 逻辑：导弹 **对象池**，碰撞 **空间网格粗筛**  
- 游戏循环：`**requestAnimationFrame`**，每帧推算 + 绘制

源码导读：`air-combat-frontend/src/README.md`。

---

## 常见问题


| 现象               | 处理                                                     |
| ---------------- | ------------------------------------------------------ |
| 预览 / 解压后 **白屏**  | 必须使用 `http(s)://`，并在 `**dist`** 目录起静态服务；勿依赖 `file://`。 |
| 联机登录失败           | **预期**：单机包无后端时请只验单机路径。                                 |
| `npm install` 失败 | 检查 Node ≥18、网络；勿提交 `node_modules`。                     |
| 端口占用             | 修改 Vite `server.port` 或换掉占用端口的进程。                      |


---

## AI 辅助开发说明

本项目 **源代码与文档的初稿主要借助 Cursor IDE 中的 GPT 类大模型辅助生成**。本人负责 **整体架构与分层设计**、接口与边界约定；对生成结果进行 **修改、裁剪与本地化调试**（含环境与构建问题）；并在提交与答辩前完成 **理解与核对**。

---

