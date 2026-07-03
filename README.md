# 体彩投注账本

一个可用的足球体彩投注记账网站：React 前端、Express 后端、SQLite 本地数据库。系统支持多个账本，例如可以单独创建“2026美加墨世界杯”账本来记录世界杯投注，也可以切换到“全部账本”查看整体投入、结余和回报率。

全新部署默认没有任何账本，需要在左侧手动新建账本或导入 Excel 时新建账本。已有旧版数据库会自动迁移，原来的投注记录会归入“2026美加墨世界杯”账本。

## 在电脑上运行预览

如果你电脑已经装了 Node.js 24+ 和 pnpm：

```bash
pnpm install
pnpm dev
```

打开 `http://127.0.0.1:5173`。

在当前 Codex 环境里，也可以直接用内置 pnpm：

```bash
/Users/yangyile/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pnpm install
/Users/yangyile/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pnpm dev
```

开发预览会同时启动：

- 前端 Vite：`http://127.0.0.1:5173`
- 后端 API：`http://127.0.0.1:5174`

## 在 NAS 上部署

推荐用 Docker / Container Manager，因为本项目后端使用 Node.js 24 的内置 SQLite。很多 NAS 自带 Node 版本偏旧，直接运行容易不兼容。

1. 把整个项目文件夹上传到 NAS，例如 `/volume1/docker/lottery-ledger`。
2. 在 NAS 终端进入项目目录：

```bash
cd /volume1/docker/lottery-ledger
docker compose up -d --build
```

3. 浏览器访问：

```text
http://NAS的局域网IP:5174
```

例如：

```text
http://192.168.1.20:5174
```

SQLite 数据保存在 NAS 项目目录的 `server/data/ledger.sqlite`，`docker-compose.yml` 已经做了数据挂载，容器重建不会丢账本。

如果你想把已经部署过的 NAS 版本恢复成完全空白账本，先停止容器，然后删除 NAS 项目目录里的这些文件，再重新启动：

```text
server/data/ledger.sqlite
server/data/ledger.sqlite-shm
server/data/ledger.sqlite-wal
```

常用维护命令：

```bash
docker compose logs -f
docker compose restart
docker compose down
docker compose up -d --build
```

如果 NAS 防火墙开启了端口限制，需要放行 TCP `5174`。

## 生产模式本机预览

想在电脑上模拟 NAS 的生产运行：

```bash
pnpm install
pnpm build
pnpm start
```

打开 `http://127.0.0.1:5174`。

## 功能

- 多账本：可新建账本、切换单个账本或查看全部账本
- 账本删除：删除时会要求二次确认，账本内投注记录会一起删除
- 投注记录新增、编辑、删除，状态会根据投入和返还自动判断
- SQLite 持久化
- Excel 导入到指定账本，支持覆盖或追加
- CSV 按当前筛选导出，文件名会使用账本名称和导出日期
- 总投入、总返还、累计盈亏、当前结余、回报率、利润率、命中率
- 每日利润、累计结余、每日投入、回报率趋势图
