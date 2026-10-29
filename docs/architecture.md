# 代码结构与数据边界

PRTS-Reader 是 Python 标准库服务与原生 HTML / CSS / ES Modules 组成的本地应用。Node.js 只用于开发时的 JavaScript 测试和格式化。应用不依赖数据源仓库 checkout，不包含知识图谱或 LLM 生成功能。

| 目录 / 文件                 | 职责                                 |
| --------------------------- | ------------------------------------ |
| `reader/index.html`         | 首页、检索页与三栏阅读页             |
| `reader/app.js`             | 页面路由、目录、正文、笔记与续读接线 |
| `reader/application.js`     | 首页呈现与编辑                       |
| `reader/corpus-search.js`   | 全库查询、分页、定位与上下文         |
| `reader/reading-session.js` | 阅读位置校验、键盘导航与专注布局     |
| `reader/features.js`        | 发言标签配色与立绘呈现               |
| `reader/data-updates.js`    | 人工检查和安装数据更新               |
| `reader/preferences.js`     | 首屏外观偏好                         |
| `scripts/serve.py`          | 本机静态文件及 JSON API              |
| `scripts/bootstrap.py`      | 新 checkout 的固定数据包初始化       |
| `scripts/prepare.py`        | 发布包校验、篇章投影、索引与字段统计 |
| `scripts/data_store.py`     | 活动快照与不可变数据目录             |
| `scripts/data_updates.py`   | 检查、暂存、校验与原子切换           |
| `scripts/search_index.py`   | 字面检索和源顺序上下文               |
| `scripts/figures.py`        | 固定来源的精确立绘匹配与缓存         |
| `scripts/home_content.py`   | 默认首页配置与本地覆盖配置           |
| `schemas/`                  | 源记录、投影、目录与笔记契约         |
| `tests/`                    | 自包含的合成数据测试与隔离预览       |

## 配置与生成文件

`config/home.example.json` 是随源码分发的默认首页；保存编辑会生成被忽略的 `config/home.json`。`config/data-source.json` 锁定首次初始化的数据包；资源来源由 `config/figure-source.json` 锁定。

首次导入生成 `data/raw/` 与 `reader/data/`。后续更新生成 `data/releases/<SHA-256>/`、`reader/snapshots/<SHA-256>/`，最后原子替换 `data/active-reader.json`。旧目录保留；活动指针写入前失败不会切换当前数据。浏览器固定使用载入时的快照路径，全文检索、上下文与立绘引用检查也携带相同快照 ID。

游戏内容、资源缓存、个人配置、笔记导出与历史考察资料不纳入版本管理。源码仓库仍附带离线阅读字体及其 OFL 许可。

## 数据契约

源记录保存在投影的 `raw` 中；`lines[].index` 是数组下标，`sourceId` 是上游 ID，`pointer` 是 `/storyList/{index}`。发言标签不等同于已消歧的角色身份；剧情按源文件顺序显示全部分支，不模拟实际游玩路线。详见 `schemas/`。

`GET /api/data/status` 返回当前快照和 `dataBase`。`GET /api/search` / `/api/search/context` 的可选 `snapshot` 参数固定查询版本；`GET /api/figure` 同样支持 `snapshot`。首页通过 `/api/home` 读取默认或覆盖配置，POST 保存本地覆盖文件。

`POST /api/data/check` 检查固定数据源，返回带 token 的候选版本；`POST /api/data/install` 只安装本次检查结果；`GET /api/data/updates` 读取后台任务状态。打开首页不会自动联网检查。API 无任意远程下载地址参数。

## 结构整理结果

独立版移除了对本机 Codex 运行时、上游 Git checkout 和预先下载的游戏数据的启动依赖；清除了已移除摘要功能的后端入口。测试改为合成剧情与资源，无需本机缓存。源码从压缩单行整理为可阅读格式，并统一编码、行尾和格式规则。

服务仍是单机应用；前端入口模块承担多个阅读交互，后续可继续按功能拆分。更新任务状态保存在当前服务进程中，重启不会自动续传；原快照仍保留。笔记不会自动迁移到新快照，避免把旧下标应用到不同内容。
