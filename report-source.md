# Noita 机制研究记录（实现用）

日期：2026-09-05。目标：为一个零后端浏览器原型提炼公开可验证的系统关系，而不是复刻原作资源或内部源码。

## 结论摘要

Noita 的识别度来自几个互相耦合的系统：程序生成的纵向地牢；每像素参与的材料模拟；玩家自定义的魔杖与法术槽；生物群系之间的安全圣山；以及永久死亡的 roguelite 循环。实现因此把每像素材料、可破坏地形、魔杖时序、修饰符链、祝福选择和深度推进放在同一套循环里。

## 证据矩阵

| 机制族 | 公开证据 | 采用的实现解释 |
|---|---|---|
| 像素物理 | [Steam 官方商店页](https://store.steampowered.com/app/881100/Noita/) 明确描述“每个像素都被模拟”，并举出燃烧、爆炸、熔化、冻结、蒸发等交互；[GDC Vault](https://www.gdcvault.com/play/1025695/Exploring-the-Tech-and-Design) 介绍 Nolla 的 falling-sand 技术。 | 用材料网格和局部 cellular automaton 处理固体、液体、气体、火焰与反应。 |
| 组合魔法 | Steam 官方页描述“组合你自己创造的法术”；[Spells](https://noita.wiki.gg/wiki/Spells) 和 [Wands](https://noita.wiki.gg/wiki/Wands) 的 Wiki 摘要列出 Cast Delay、Recharge Time、Mana、Mana Recharge 等关系。 | 魔杖是容器，槽位里放基础法术和修饰；基础法术决定投射物，修饰改变数量、追踪、爆炸、火焰、弹射、暴击或耗蓝。 |
| 魔杖时序 | [Wand/Spell Interactions](https://steamcommunity.com/sharedfiles/filedetails/?id=1875447576) 说明 Cast Delay 与 Recharge Time 的实际交互；Wiki 的 [Wands](https://noita.wiki.gg/wiki/Wands) 摘要说明魔力每帧按回复速度恢复。 | 用 `castDelay + spell.delay` 形成槽间冷却，用独立 recharge/timer 控制射击节奏，保留“持续按住发射”的手感。 |
| 材料与炼金 | [Materials](https://noita.wiki.gg/wiki/Materials)、[Alchemy](https://noita.wiki.gg/wiki/Alchemy) 和 [Water/Reactions](https://noita.wiki.gg/wiki/Water/Reactions) 记录液体、粉末、气体和相互转化；Wiki 摘要明确列出水与毒泥净化、熔岩/水反应等方向。 | 覆盖水、油、熔岩、血、毒液、砂、雪、火、烟、蒸汽等高辨识度材料；实现熔岩遇水成石、火扩散、蒸汽上升和液体流动。 |
| 伤害与状态 | [Damage Types](https://noita.wiki.gg/wiki/Damage_Types)、[Status Effects](https://noita.wiki.gg/wiki/Status_Effects) 和 [Enemy Immunities](https://noita.wiki.gg/wiki/Enemy_Immunities) 的 Wiki 摘要显示伤害类型和状态/抗性是独立层。 | 原型保留爆炸、火焰、投射物、毒液和近战几类来源，并让祝福修改伤害与暴击。 |
| 地牢循环 | [Biomes](https://noita.wiki.gg/wiki/Biomes) 摘要说明主路径由 8 个生物群系组成，每层之间有 Holy Mountain；[Perks](https://noita.wiki.gg/wiki/Perks) 和 [Holy Mountain](https://noita.wiki.gg/wiki/Holy_Mountain) 记录祝福与魔杖编辑的安全区。 | 生成 8 段纵向区域、圣山房间、三选一祝福、魔杖编辑和终层首领。 |
| roguelite 结构 | [Steam 官方页](https://store.steampowered.com/app/881100/Noita/) 描述程序生成世界、永久死亡和“每次继续深入”。 | 死亡清空本局，种子重新生成；胜利击败终焉之眼后显示完成界面。 |

## 版本与证据限制

Noita Wiki 的部分页面在本环境中被 robots/403 阻挡，因此精确数值、完整条目数量和版本差异没有被冒充为已逐项核验；这份记录只把多个来源一致支持的系统关系用于实现。原作还包含更多法术、隐藏区域、敌人、秘密结局、成就、模组和精确材料配方，本原型将其留在扩展空间内。
