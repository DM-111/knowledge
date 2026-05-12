-- 008: 向量搜索支持（sqlite-vec）
-- 目的：为 chunks 添加向量索引，支持语义相似度检索

-- 向量虚拟表（384 维 float32，对应 bge-small-zh-v1.5）
-- rowid 与 chunks.id 一一对应
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
  embedding float[384]
);

-- 标记 chunk 的 embedding 状态
-- 0 = 未生成, 1 = bge-small-zh-v1.5
ALTER TABLE chunks ADD COLUMN embedding_version INTEGER NOT NULL DEFAULT 0;

-- 用于快速查找未生成 embedding 的 chunks
CREATE INDEX idx_chunks_embedding_version ON chunks(embedding_version);
