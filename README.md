# 方块碰碰场 · Block Bounce

可直接部署到 GitHub Pages 的纯静态小游戏。方块沿初始速度自动弹跳，不追逐、不受玩家操控；撞到边界、其他方块或障碍物时会反弹，碰撞还会触发表情变化。

## 已实现

- 浅色玻璃拟态界面；响应式大竞技场，并带可见的硬边界。
- 对局设置：方块数量 1–48、障碍物数量 0–12；默认 8 个方块、4 个障碍物。
- 每局随机生成分散的 HSL 色相，当前对局内颜色唯一；不同方块有不同的待机表情，碰撞时会惊讶、眯眼或晕乎乎。
- 方块与边界、方块与方块、方块与矩形障碍物的实体碰撞和反弹；随机生成时会避开障碍物及其他方块。
- 暂停、重新开始、碰撞计数和最近碰撞事件。
- 道具系统只定义了生命周期 / 更新 / 绘制 / 碰撞接口，默认关闭且没有实现道具内容。
- Canvas 首帧绘制失败时显示可见的 HTML 方块回退画面，不会只留下空黑场。

## 游戏配置接口

浏览器控制台可用 `window.BlockBounce`：

```js
BlockBounce.startMatch({ blockCount: 12, obstacleCount: 5 });
BlockBounce.getConfig();
BlockBounce.getSnapshot();
BlockBounce.createUniqueColors(12); // 返回本局互不重复的颜色
BlockBounce.systems.items.enabled; // false：预留接口，尚未启用
```

默认值和边界限制在 `BlockBounce.defaults` / `BlockBounce.limits` 中；障碍物创建接口位于 `BlockBounce.systems.obstacles`。

## 本地运行

无需安装依赖。直接打开 `index.html`，或在仓库根目录运行：

```bash
python3 -m http.server 8000
```

然后访问 `http://localhost:8000`。

## GitHub Pages

文件位于仓库根目录。合并到 `main` 后，打开 **Settings → Pages**，选择 **Deploy from a branch**，分支选择 `main`、目录选择 `/(root)` 并保存即可。
