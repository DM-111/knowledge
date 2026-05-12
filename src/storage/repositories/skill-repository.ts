import type Database from 'better-sqlite3';
import type { DatabaseProvider } from '../provider.js';

export interface GeneratedSkillRow {
  id: number;
  knowledgeItemId: number;
  skillName: string;
  skillPath: string;
  generatedAt: string;
}

export interface CreateGeneratedSkillInput {
  knowledgeItemId: number;
  skillName: string;
  skillPath: string;
}

export class SkillRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  create(
    input: CreateGeneratedSkillInput,
    db: Database.Database = this.provider.getConnection(),
  ): number {
    const result = db
      .prepare(
        `INSERT INTO generated_skills (knowledge_item_id, skill_name, skill_path)
         VALUES (?, ?, ?)`,
      )
      .run(input.knowledgeItemId, input.skillName, input.skillPath);

    return Number(result.lastInsertRowid);
  }

  findByItemId(
    knowledgeItemId: number,
    db: Database.Database = this.provider.getConnection(),
  ): GeneratedSkillRow | undefined {
    const row = db
      .prepare(
        `SELECT id, knowledge_item_id, skill_name, skill_path, generated_at
         FROM generated_skills WHERE knowledge_item_id = ?`,
      )
      .get(knowledgeItemId) as
      | { id: number; knowledge_item_id: number; skill_name: string; skill_path: string; generated_at: string }
      | undefined;

    if (!row) return undefined;
    return {
      id: row.id,
      knowledgeItemId: row.knowledge_item_id,
      skillName: row.skill_name,
      skillPath: row.skill_path,
      generatedAt: row.generated_at,
    };
  }

  findByName(
    skillName: string,
    db: Database.Database = this.provider.getConnection(),
  ): GeneratedSkillRow | undefined {
    const row = db
      .prepare(
        `SELECT id, knowledge_item_id, skill_name, skill_path, generated_at
         FROM generated_skills WHERE skill_name = ?`,
      )
      .get(skillName) as
      | { id: number; knowledge_item_id: number; skill_name: string; skill_path: string; generated_at: string }
      | undefined;

    if (!row) return undefined;
    return {
      id: row.id,
      knowledgeItemId: row.knowledge_item_id,
      skillName: row.skill_name,
      skillPath: row.skill_path,
      generatedAt: row.generated_at,
    };
  }

  listAll(
    db: Database.Database = this.provider.getConnection(),
  ): GeneratedSkillRow[] {
    const rows = db
      .prepare(
        `SELECT id, knowledge_item_id, skill_name, skill_path, generated_at
         FROM generated_skills ORDER BY generated_at DESC`,
      )
      .all() as Array<{ id: number; knowledge_item_id: number; skill_name: string; skill_path: string; generated_at: string }>;

    return rows.map((r) => ({
      id: r.id,
      knowledgeItemId: r.knowledge_item_id,
      skillName: r.skill_name,
      skillPath: r.skill_path,
      generatedAt: r.generated_at,
    }));
  }

  deleteByName(
    skillName: string,
    db: Database.Database = this.provider.getConnection(),
  ): void {
    db.prepare('DELETE FROM generated_skills WHERE skill_name = ?').run(skillName);
  }
}
