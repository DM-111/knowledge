export type { NoteType, NoteSource, NoteFrontmatter, NoteFile } from './types.js';
export type {
  CreateNoteInput,
  UpdateNoteInput,
  ListNotesOptions,
  GenerateNoteOptions,
  GenerateNoteBundle,
  WriteGeneratedNoteInput,
} from './types.js';

export {
  generateNoteId,
  buildNoteFilePath,
  parseNoteFile,
  writeNoteFile,
  createNote,
  getNote,
  updateNote,
  deleteNote,
  listNotes,
  prepareNoteGeneration,
  writeGeneratedNote,
} from './notes-manager.js';
