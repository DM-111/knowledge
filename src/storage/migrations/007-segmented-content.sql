-- 007: 添加 content_segmented 列并重建 FTS5 索引
-- 目的：存储 jieba 分词后的内容，使 FTS5 能按词匹配中文
--
-- 设计决策：放弃 external content 模式（content='chunks'），改为 FTS5 自行存储内容。
-- 原因：external content 模式下 snippet() 从源表读数据，但 content_segmented 列
-- 在旧数据中为 NULL，导致 snippet 返回 NULL。自存模式下 FTS 表始终有完整数据。
-- 代价：约 2x 磁盘占用（chunk 文本存两份），对 ≤10K items 的规模可接受。

ALTER TABLE chunks ADD COLUMN content_segmented TEXT;

-- 移除旧触发器
DROP TRIGGER IF EXISTS chunks_ai;
DROP TRIGGER IF EXISTS chunks_ad;
DROP TRIGGER IF EXISTS chunks_au;

-- 移除旧 FTS 表（external content 模式）
DROP TABLE IF EXISTS chunks_fts;

-- 重建 FTS 表（自存模式，无 content= 参数）
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content_segmented,
  knowledge_item_id UNINDEXED,
  chunk_index UNINDEXED
);

-- 触发器：自存模式使用标准 INSERT/DELETE 操作
CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts (rowid, content_segmented, knowledge_item_id, chunk_index)
  VALUES (new.id, COALESCE(new.content_segmented, new.content), new.knowledge_item_id, new.chunk_index);
END;

CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
  DELETE FROM chunks_fts WHERE rowid = old.id;
END;

CREATE TRIGGER chunks_au AFTER UPDATE ON chunks BEGIN
  DELETE FROM chunks_fts WHERE rowid = old.id;
  INSERT INTO chunks_fts (rowid, content_segmented, knowledge_item_id, chunk_index)
  VALUES (new.id, COALESCE(new.content_segmented, new.content), new.knowledge_item_id, new.chunk_index);
END;

-- 迁移已有数据到新 FTS 表
INSERT INTO chunks_fts (rowid, content_segmented, knowledge_item_id, chunk_index)
  SELECT id, content, knowledge_item_id, chunk_index FROM chunks;
