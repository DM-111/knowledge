import type Database from 'better-sqlite3';
import type { DatabaseProvider } from '../provider.js';

export type QuizLevel = 'recall' | 'understanding' | 'application' | 'analysis';

export interface QuizSessionRow {
  id: number;
  knowledgeItemId: number;
  startedAt: string;
  completedAt: string | null;
  level: QuizLevel;
  totalQuestions: number;
  correctAnswers: number;
}

export interface QuizAnswerRow {
  id: number;
  sessionId: number;
  chunkId: number | null;
  question: string;
  expectedAnswer: string;
  userAnswer: string | null;
  isCorrect: number | null;
  feedback: string | null;
  level: QuizLevel;
  answeredAt: string | null;
}

export interface CreateQuizAnswerInput {
  sessionId: number;
  chunkId?: number;
  question: string;
  expectedAnswer: string;
  userAnswer?: string;
  isCorrect?: boolean;
  feedback?: string;
  level: QuizLevel;
}

export class QuizRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  createSession(
    knowledgeItemId: number,
    level: QuizLevel,
    db: Database.Database = this.provider.getConnection(),
  ): number {
    const result = db
      .prepare(
        `INSERT INTO quiz_sessions (knowledge_item_id, level)
         VALUES (?, ?)`,
      )
      .run(knowledgeItemId, level);

    return Number(result.lastInsertRowid);
  }

  completeSession(
    sessionId: number,
    totalQuestions: number,
    correctAnswers: number,
    db: Database.Database = this.provider.getConnection(),
  ): void {
    db.prepare(
      `UPDATE quiz_sessions
       SET completed_at = datetime('now'),
           total_questions = ?,
           correct_answers = ?
       WHERE id = ?`,
    ).run(totalQuestions, correctAnswers, sessionId);
  }

  getSession(
    sessionId: number,
    db: Database.Database = this.provider.getConnection(),
  ): QuizSessionRow | undefined {
    const row = db
      .prepare(
        `SELECT id, knowledge_item_id, started_at, completed_at, level, total_questions, correct_answers
         FROM quiz_sessions WHERE id = ?`,
      )
      .get(sessionId) as {
      id: number;
      knowledge_item_id: number;
      started_at: string;
      completed_at: string | null;
      level: string;
      total_questions: number;
      correct_answers: number;
    } | undefined;

    if (!row) return undefined;
    return {
      id: row.id,
      knowledgeItemId: row.knowledge_item_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      level: row.level as QuizLevel,
      totalQuestions: row.total_questions,
      correctAnswers: row.correct_answers,
    };
  }

  addAnswer(
    input: CreateQuizAnswerInput,
    db: Database.Database = this.provider.getConnection(),
  ): number {
    const result = db
      .prepare(
        `INSERT INTO quiz_answers (session_id, chunk_id, question, expected_answer, user_answer, is_correct, feedback, level, answered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.sessionId,
        input.chunkId ?? null,
        input.question,
        input.expectedAnswer,
        input.userAnswer ?? null,
        input.isCorrect !== undefined ? (input.isCorrect ? 1 : 0) : null,
        input.feedback ?? null,
        input.level,
        input.userAnswer ? new Date().toISOString() : null,
      );

    return Number(result.lastInsertRowid);
  }

  getSessionAnswers(
    sessionId: number,
    db: Database.Database = this.provider.getConnection(),
  ): QuizAnswerRow[] {
    const rows = db
      .prepare(
        `SELECT id, session_id, chunk_id, question, expected_answer, user_answer,
                is_correct, feedback, level, answered_at
         FROM quiz_answers WHERE session_id = ? ORDER BY id ASC`,
      )
      .all(sessionId) as Array<{
      id: number;
      session_id: number;
      chunk_id: number | null;
      question: string;
      expected_answer: string;
      user_answer: string | null;
      is_correct: number | null;
      feedback: string | null;
      level: string;
      answered_at: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      chunkId: r.chunk_id,
      question: r.question,
      expectedAnswer: r.expected_answer,
      userAnswer: r.user_answer,
      isCorrect: r.is_correct,
      feedback: r.feedback,
      level: r.level as QuizLevel,
      answeredAt: r.answered_at,
    }));
  }

  getItemHistory(
    knowledgeItemId: number,
    limit = 10,
    db: Database.Database = this.provider.getConnection(),
  ): QuizSessionRow[] {
    const rows = db
      .prepare(
        `SELECT id, knowledge_item_id, started_at, completed_at, level, total_questions, correct_answers
         FROM quiz_sessions
         WHERE knowledge_item_id = ? AND completed_at IS NOT NULL
         ORDER BY started_at DESC LIMIT ?`,
      )
      .all(knowledgeItemId, limit) as Array<{
      id: number;
      knowledge_item_id: number;
      started_at: string;
      completed_at: string | null;
      level: string;
      total_questions: number;
      correct_answers: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      knowledgeItemId: r.knowledge_item_id,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      level: r.level as QuizLevel,
      totalQuestions: r.total_questions,
      correctAnswers: r.correct_answers,
    }));
  }
}
