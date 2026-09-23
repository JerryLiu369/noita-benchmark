# 🎯 评测统一提示词与启动指令 (Evaluation Prompt & Runner Commands)

本评测对所有参赛模型（GPT-6-Astra、DeepSeek-V4.1-Flash、Step-5-Preview、Gemini-3.8-Flash、MiMo-Pro/Flash、Muse-Spark 等）采用**完全同构、零人工干预、单次输入**的标准自动化启动流程。

---

## 1. 🤖 Agent 入场启动 Prompt (Prompt Text)

模型入场时，仅接收以下单句中性指令，不带任何过程暗示、框架偏好或实现路径诱导：

```text
请仔细研读仓库内的 TASK.md 与 refs/ 资料，自主将当前游戏全面重做为机制高还原、画面与物理完备的 Noita 网页像素游戏，并在完成后编写 DONE.md 说明。
```

---

## 2. 💻 CLI 启动命令原型 (Runner Command)

每个模型均在独立的沙盒工作区内，通过通用 Coding Agent Harness（如 OpenCode CLI）无交互拉起：

```bash
#!/usr/bin/env bash
export PATH="/home/ubuntu/.opencode/bin:$PATH"

# 1. 进入该模型的干净工作副本
cd /path/to/noita-workspace

# 2. 统一启动指令
PROMPT="请仔细研读仓库内的 TASK.md 与 refs/ 资料，自主将当前游戏全面重做为机制高还原、画面与物理完备的 Noita 网页像素游戏，并在完成后编写 DONE.md 说明。"

# 3. 拉起长程 Agent 自主攻坚（开启全权限执行与对应思考深度）
opencode run --agent bypassPermissions -m "<PROVIDER>/<MODEL>" "$PROMPT" 2>&1 | tee run.log
```

---

## 3. 📋 沙盒内任务书规范 (`TASK.md` 核心内容)

模型在进入仓库后，会自主阅读根目录下的 `TASK.md`。其规范定义了 7 大核心机制与 5 大红线：

### 核心机制要求：
1. **像素物理 (Cellular Automata)**：
   - 严格遵循真实密度分层（油 0.8 浮于 水 1.0 上，血 1.05 / 毒 1.15 / 强酸 1.4 下沉，熔岩 2.6 沉底）；
   - 炼金反应完整（熔岩遇水凝结为岩石并蒸腾出上升蒸汽，强酸腐蚀一切可腐蚀固体，水净化毒液等）；
   - 火焰蔓延与自然熄灭；材料颗粒质感渲染，拒绝单一纯色块。
2. **黑暗与径向动态光照**：
   - 地牢整体环境压暗，由火把、法术弹体、岩浆与荧光矿物通过径向渐变光晕照亮，还原 Noita 独特的洞穴幽闭氛围。
3. **法杖组装与牌库构筑**：
   - 弹体（Projectiles）、修饰符（Modifiers）与触发器（Triggers）的链式读取机制；
   - 支持槽位洗牌回绕、法杖掉落拾取与编辑台/圣山交互式组装。
4. **向下探索与因果死因追溯**：
   - 多层向下地牢（矿坑→煤坑→真菌洞→雪山→熔岩湖等）；
   - **死亡面板必须断言精确死因**（如：被火焰烧死、窒息溺亡、被落石压死、强酸溶蚀、被特定敌人射杀），杜绝模糊死亡。
5. **视听打击感**：
   - 屏幕震动（Screen Shake）、命中闪白、受击流血粒子爆裂、WebAudio 原生合成无依赖音效。
6. **敌人 AI 与生态**：
   - 至少 5 种行为模式差异明显的敌人（近战冲锋、远程弹幕、飞行俯冲、自爆突袭、潜地潜伏等）。
7. **跨端输入支持**：
   - 桌面端键盘鼠标 + 移动触屏虚拟摇杆双端自适应。

### 评审红线 (Hard Gates)：
- **纯前端零依赖**：单目录 `index.html` + `game.js` + `styles.css`，严禁引入 npm、Vite、Webpack 等构建步骤，严禁请求任何外网 CDN 素材；
- **自测闭环**：模型交付前必须自主编写 Headless 自动化测试脚本（Puppeteer/CDP/Playwright），真机下井模拟并确保无报错后方可离场；
- **交付凭证**：最终成果必须以 `DONE.md` 详实总结架构设计、实测数据与代码实现。
