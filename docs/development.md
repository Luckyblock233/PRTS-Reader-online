# 开发与验证

## 环境

运行：Python 3.10+，无第三方运行时依赖。开发：Node.js 22+、pnpm 11.25.0；Python 可选开发依赖见 `requirements-dev.txt`。

```sh
python -m venv .venv
# 激活环境后：
python -m pip install -r requirements-dev.txt
pnpm install --frozen-lockfile
```

## 日常检查

```sh
python -m unittest discover -s tests -p "test_*.py" -v
pnpm test
python -m ruff format --check scripts tests
pnpm format:check
```

这些测试只使用临时目录、合成剧情与模拟网络，不要求初始化真实语料。`tests/preview_data_updates.py` 可在 `127.0.0.1:8769` 启动隔离的更新流程样例，Ctrl+C 结束。

格式化：`python -m ruff format scripts tests` 和 `pnpm format`。Python 与前端均以 UTF-8 保存，Python 使用四空格，其他源码使用两空格。

## 真实数据走查

```sh
python scripts/bootstrap.py
python scripts/serve.py --port 8766
```

可选的全量原文保全与 JSON Schema 校验：`python scripts/verify.py`。该命令需要开发依赖和活动快照对应的 ZIP；读取原始 JSON 与投影并核对来源哈希、行号、Pointer、检索定位和 schema。它不访问网络。

## 发布前检查

`git status --ignored --short` 应显示游戏数据、缓存、个人配置及上游 checkout 为忽略项。用 `git ls-files` 核对发布清单，源码包不应包含这些内容；`git archive` 只导出已提交源码。

暂存文件后运行 `python scripts/check_release.py`，检查索引中的生成文件、个人配置、常见密钥形式和离线字体哈希。该扫描是发布清单检查，不能保证识别所有种类的秘密信息。

CI 检查 Windows / Linux、Python 3.10 / 3.13 的合成数据测试，以及 JavaScript 测试和格式规则。工作流已提供，远程 CI 的实际状态须在推送后确认。本项目不配置自动发布或自动推送。

## 独立版验证记录

首次开源整理已在不含上游 checkout、个人配置和缓存的源码导出副本中验证：

- 28 项 Python 测试与 9 项 JavaScript 测试通过；格式和语法检查通过。
- 使用锁定发布包完成独立初始化，生成 2,295 篇、1,103,636 条源记录及 427,205 条可检索记录。
- 2,295 篇源 schema、全量 raw 保全、目录、检索定位和笔记导出契约检查通过；投影 schema 按 6 类篇章抽样验证。
- 浏览器确认默认首页、全文查询、上下文展开、原文跳转和关键词高亮正常，控制台无错误。
- Git 索引审计通过，原始游戏包、立绘、个人首页和运行时配置均排除；离线字体 SHA-256 与来源记录一致。

这些是本地验证结果，不代表已经运行远程 CI 或覆盖了所有浏览器。
