# Deferred Work

## Deferred from: code review of 3-2-检索过滤与知识条目列表-kb-list (2026-04-22)

- 动态 SQL 导致无法缓存预编译 Statement（`search-repository.ts`）— 旧缓存针对固定 SQL；现在 SQL 按过滤条件动态生成，需按过滤组合键缓存，复杂度留待性能优化再处理
- `formatKnowledgeListText` 输出原始 UTC ISO 时间戳（`list.ts`）— 输出格式化属于 Story 3.3 职责，本故事明确约定不超前实现
- 集成测试直接写库绕过入库路径设置 `created_at`（`tests/integration/search.test.ts`）— 为模拟特定时间范围需要篡改 DB，测试工程实践问题，不影响业务正确性
