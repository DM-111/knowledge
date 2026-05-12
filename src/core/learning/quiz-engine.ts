import { initializeStorage } from '../../storage/index.js';
import { QuizRepository, type QuizLevel, type QuizSessionRow } from '../../storage/repositories/quiz-repository.js';

export type { QuizLevel } from '../../storage/repositories/quiz-repository.js';

export interface StartQuizOptions {
  dbPath: string;
  itemId: number;
  level: QuizLevel;
  count: number;
}

export interface StartQuizResult {
  sessionId: number;
  itemTitle: string;
  level: QuizLevel;
  count: number;
  chunks: Array<{ chunkId: number; index: number; content: string }>;
  totalChunks: number;
}

export interface RecordAnswerOptions {
  dbPath: string;
  sessionId: number;
  chunkId?: number;
  question: string;
  expectedAnswer: string;
  userAnswer: string;
  isCorrect: boolean;
  feedback: string;
  level: QuizLevel;
}

export interface QuizSummary {
  sessionId: number;
  itemTitle: string;
  level: QuizLevel;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  answers: Array<{
    question: string;
    userAnswer: string | null;
    isCorrect: boolean;
    feedback: string | null;
  }>;
}

export interface QuizHistoryEntry {
  sessionId: number;
  level: QuizLevel;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  startedAt: string;
}

/**
 * Start a quiz session. Returns selected chunks for question generation.
 */
export function startQuiz(options: StartQuizOptions): StartQuizResult {
  const { dbPath, itemId, level, count } = options;
  const provider = initializeStorage({ dbPath });

  try {
    const db = provider.getConnection();
    const repo = new QuizRepository(provider);

    // Get item title
    const item = db
      .prepare('SELECT title FROM knowledge_items WHERE id = ?')
      .get(itemId) as { title: string } | undefined;

    if (!item) {
      throw new Error(`知识条目 #${itemId} 不存在`);
    }

    // Get chunks for question generation
    const allChunks = db
      .prepare(
        'SELECT id, chunk_index, content FROM chunks WHERE knowledge_item_id = ? ORDER BY chunk_index ASC',
      )
      .all(itemId) as Array<{ id: number; chunk_index: number; content: string }>;

    if (allChunks.length === 0) {
      throw new Error(`条目 #${itemId} 没有内容段落`);
    }

    // Select chunks based on level
    const selectedChunks = selectChunksForQuiz(allChunks, count, level);

    // Create session
    const sessionId = repo.createSession(itemId, level, db);

    return {
      sessionId,
      itemTitle: item.title,
      level,
      count,
      chunks: selectedChunks.map((c) => ({
        chunkId: c.id,
        index: c.chunk_index,
        content: c.content,
      })),
      totalChunks: allChunks.length,
    };
  } finally {
    provider.close();
  }
}

/**
 * Record a quiz answer.
 */
export function recordAnswer(options: RecordAnswerOptions): void {
  const { dbPath, sessionId, chunkId, question, expectedAnswer, userAnswer, isCorrect, feedback, level } = options;
  const provider = initializeStorage({ dbPath });

  try {
    const repo = new QuizRepository(provider);
    repo.addAnswer({
      sessionId,
      chunkId,
      question,
      expectedAnswer,
      userAnswer,
      isCorrect,
      feedback,
      level,
    });
  } finally {
    provider.close();
  }
}

/**
 * Get quiz session summary with all answers.
 */
export function getQuizSummary(dbPath: string, sessionId: number): QuizSummary | null {
  const provider = initializeStorage({ dbPath });

  try {
    const db = provider.getConnection();
    const repo = new QuizRepository(provider);

    const session = repo.getSession(sessionId, db);
    if (!session) return null;

    const item = db
      .prepare('SELECT title FROM knowledge_items WHERE id = ?')
      .get(session.knowledgeItemId) as { title: string } | undefined;

    const answers = repo.getSessionAnswers(sessionId, db);

    const answeredCount = answers.filter((a) => a.userAnswer !== null).length;
    const correctCount = answers.filter((a) => a.isCorrect === 1).length;

    // Auto-complete session if all answered
    if (answeredCount > 0 && !session.completedAt) {
      repo.completeSession(sessionId, answeredCount, correctCount, db);
    }

    return {
      sessionId,
      itemTitle: item?.title ?? '(unknown)',
      level: session.level,
      totalQuestions: answeredCount,
      correctAnswers: correctCount,
      accuracy: answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0,
      answers: answers.map((a) => ({
        question: a.question,
        userAnswer: a.userAnswer,
        isCorrect: a.isCorrect === 1,
        feedback: a.feedback,
      })),
    };
  } finally {
    provider.close();
  }
}

/**
 * Get quiz history for an item.
 */
export function getQuizHistory(dbPath: string, itemId: number): QuizHistoryEntry[] {
  const provider = initializeStorage({ dbPath });

  try {
    const repo = new QuizRepository(provider);
    const sessions = repo.getItemHistory(itemId);

    return sessions.map((s) => ({
      sessionId: s.id,
      level: s.level,
      totalQuestions: s.totalQuestions,
      correctAnswers: s.correctAnswers,
      accuracy: s.totalQuestions > 0 ? Math.round((s.correctAnswers / s.totalQuestions) * 100) : 0,
      startedAt: s.startedAt,
    }));
  } finally {
    provider.close();
  }
}

/**
 * Select chunks for quiz based on difficulty level.
 */
function selectChunksForQuiz(
  chunks: Array<{ id: number; chunk_index: number; content: string }>,
  count: number,
  level: QuizLevel,
): Array<{ id: number; chunk_index: number; content: string }> {
  const targetCount = Math.min(count * 2, chunks.length); // Select more chunks than questions for variety

  switch (level) {
    case 'recall':
      // Random selection, prefer shorter chunks (factual content)
      return shuffleAndTake(chunks, targetCount);
    case 'understanding':
      // Prefer chunks in first half (definitions, explanations)
      return shuffleAndTake(chunks.slice(0, Math.ceil(chunks.length * 0.6)), targetCount);
    case 'application':
      // Prefer middle chunks (examples, procedures)
      const start = Math.floor(chunks.length * 0.2);
      const end = Math.ceil(chunks.length * 0.8);
      return shuffleAndTake(chunks.slice(start, end), targetCount);
    case 'analysis':
      // Use longer chunks, multiple related ones
      return shuffleAndTake(
        chunks.filter((c) => c.content.length > 200),
        targetCount,
      );
    default:
      return shuffleAndTake(chunks, targetCount);
  }
}

function shuffleAndTake<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
