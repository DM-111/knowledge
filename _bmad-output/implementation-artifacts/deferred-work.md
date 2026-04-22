# Deferred Work

## Deferred from: code review of 3-2-检索过滤与知识条目列表-kb-list (2026-04-22)

## Deferred from: code review of 3-3-输出格式化策略-tty-非-tty-json (2026-04-22)

- 搜索执行两次独立 DB 查询（results + count）无事务保护，极端高并发写入时 total 可能与 items 微量不一致（`src/core/search/index.ts`）— 设计权衡，SQLite WAL 快照隔离已部分缓解
- TTY 格式化器不检查 `NO_COLOR` / `TERM=dumb` 环境变量（`src/cli/formatters/tty-formatter.ts`）— no-color.org 规范合规性，超出当前 Story 范围
- `formatSearchResultJson` / `formatKnowledgeListJson` 直接序列化内部类型，内部 schema 即为公开 JSON 契约（`src/cli/formatters/json-formatter.ts`）— 未来可引入显式 DTO 映射层以解耦内外契约
- JSON 错误体输出 `source` 字段超出 AC4 规范定义（`src/cli/formatters/json-formatter.ts`）— 实用扩展，后续可考虑正式纳入规范
- `argv.includes('--json')` 预解析检测分散于 `run()` 与 `main.ts` 两处（`src/cli/index.ts`, `src/cli/main.ts`）— 防御性冗余，可在未来重构时统一

## Deferred from: code review of 3-2-检索过滤与知识条目列表-kb-list (2026-04-22)

- 动态 SQL 导致无法缓存预编译 Statement（`search-repository.ts`）— 旧缓存针对固定 SQL；现在 SQL 按过滤条件动态生成，需按过滤组合键缓存，复杂度留待性能优化再处理
- `formatKnowledgeListText` 输出原始 UTC ISO 时间戳（`list.ts`）— 输出格式化属于 Story 3.3 职责，本故事明确约定不超前实现
- 集成测试直接写库绕过入库路径设置 `created_at`（`tests/integration/search.test.ts`）— 为模拟特定时间范围需要篡改 DB，测试工程实践问题，不影响业务正确性
