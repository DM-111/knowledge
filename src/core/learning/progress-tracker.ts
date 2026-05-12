import { initializeStorage } from '../../storage/index.js';
import { ProgressRepository, type ReadingProgressRow, type BookmarkRow } from '../../storage/repositories/progress-repository.js';

export type ReadingStatus = 'not_started' | 'reading' | 'completed';

export interface ReadingProgressInfo {
  itemId: number;
  itemTitle: string;
  currentChunkIndex: number;
  totalChunks: number;
  percentage: number;
  status: ReadingStatus;
  startedAt?: string;
  completedAt?: string;
  lastReadAt?: string;
  bookmarks: BookmarkRow[];
}

export interface UpdateProgressOptions {
  dbPath: string;
  itemId: number;
  chunkIndex: number;
  status?: ReadingStatus;
}

export interface GetProgressOptions {
  dbPath: string;
  itemId: number;
}

export interface AddBookmarkOptions {
  dbPath: string;
  itemId: number;
  chunkIndex: number;
  label?: string;
  note?: string;
}

export interface ReadingReport {
  inProgress: ReadingProgressInfo[];
  completed: ReadingProgressInfo[];
  totalItemsRead: number;
  totalWordsRead: number;
}

export function getProgress(options: GetProgressOptions): ReadingProgressInfo | null {
  const provider = initializeStorage({ dbPath: options.dbPath });
  try {
    const repo = new ProgressRepository(provider);
    const db = provider.getConnection();

    const progress = repo.getProgress(options.itemId, db);

    // Get item title
    const item = db
      .prepare('SELECT title, word_count FROM knowledge_items WHERE id = ?')
      .get(options.itemId) as { title: string; word_count: number } | undefined;

    if (!item) return null;

    // Get total chunks if no progress record yet
    const chunkCount = db
      .prepare('SELECT COUNT(*) as count FROM chunks WHERE knowledge_item_id = ?')
      .get(options.itemId) as { count: number };

    const bookmarks = repo.getBookmarks(options.itemId, db);

    if (!progress) {
      return {
        itemId: options.itemId,
        itemTitle: item.title,
        currentChunkIndex: 0,
        totalChunks: chunkCount.count,
        percentage: 0,
        status: 'not_started',
        bookmarks,
      };
    }

    return {
      itemId: options.itemId,
      itemTitle: item.title,
      currentChunkIndex: progress.currentChunkIndex,
      totalChunks: progress.totalChunks,
      percentage: progress.percentage,
      status: progress.status as ReadingStatus,
      startedAt: progress.startedAt ?? undefined,
      completedAt: progress.completedAt ?? undefined,
      lastReadAt: progress.lastReadAt ?? undefined,
      bookmarks,
    };
  } finally {
    provider.close();
  }
}

export function updateProgress(options: UpdateProgressOptions): ReadingProgressInfo {
  const provider = initializeStorage({ dbPath: options.dbPath });
  try {
    const repo = new ProgressRepository(provider);
    const db = provider.getConnection();

    // Get total chunks
    const chunkCount = db
      .prepare('SELECT COUNT(*) as count FROM chunks WHERE knowledge_item_id = ?')
      .get(options.itemId) as { count: number };

    repo.upsertProgress(
      {
        knowledgeItemId: options.itemId,
        currentChunkIndex: options.chunkIndex,
        totalChunks: chunkCount.count,
        status: options.status,
      },
      db,
    );

    const result = getProgress({ dbPath: options.dbPath, itemId: options.itemId });
    if (!result) {
      throw new Error(`Item ${options.itemId} not found`);
    }
    return result;
  } finally {
    provider.close();
  }
}

export function addBookmark(options: AddBookmarkOptions): { bookmarkId: number } {
  const provider = initializeStorage({ dbPath: options.dbPath });
  try {
    const repo = new ProgressRepository(provider);
    const bookmarkId = repo.addBookmark({
      knowledgeItemId: options.itemId,
      chunkIndex: options.chunkIndex,
      label: options.label,
      note: options.note,
    });
    return { bookmarkId };
  } finally {
    provider.close();
  }
}

export function getReadingReport(dbPath: string): ReadingReport {
  const provider = initializeStorage({ dbPath });
  try {
    const repo = new ProgressRepository(provider);
    const db = provider.getConnection();

    const inProgressRows = repo.getInProgressItems(db);
    const completedRows = repo.getCompletedItems(10, db);

    const enrichRow = (row: ReadingProgressRow): ReadingProgressInfo => {
      const item = db
        .prepare('SELECT title FROM knowledge_items WHERE id = ?')
        .get(row.knowledgeItemId) as { title: string } | undefined;
      const bookmarks = repo.getBookmarks(row.knowledgeItemId, db);
      return {
        itemId: row.knowledgeItemId,
        itemTitle: item?.title ?? '(unknown)',
        currentChunkIndex: row.currentChunkIndex,
        totalChunks: row.totalChunks,
        percentage: row.percentage,
        status: row.status as ReadingStatus,
        startedAt: row.startedAt ?? undefined,
        completedAt: row.completedAt ?? undefined,
        lastReadAt: row.lastReadAt ?? undefined,
        bookmarks,
      };
    };

    // Compute total words read (completed items)
    const wordCountResult = db
      .prepare(
        `SELECT COALESCE(SUM(k.word_count), 0) as total
         FROM reading_progress rp
         JOIN knowledge_items k ON k.id = rp.knowledge_item_id
         WHERE rp.status = 'completed'`,
      )
      .get() as { total: number };

    return {
      inProgress: inProgressRows.map(enrichRow),
      completed: completedRows.map(enrichRow),
      totalItemsRead: completedRows.length,
      totalWordsRead: wordCountResult.total,
    };
  } finally {
    provider.close();
  }
}
