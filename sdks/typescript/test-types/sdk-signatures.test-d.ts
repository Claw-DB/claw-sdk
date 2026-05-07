import clawdb, { ClawDB, type MemoryOptions, type SearchOptions, type SearchHit } from '../src/index';

async function run(): Promise<void> {
  const db = await clawdb();
  const fromEnv = ClawDB.fromEnv();

  const rememberOptions: MemoryOptions = {
    memoryType: 'message',
    tags: ['sdk'],
    metadata: { ok: true }
  };

  const searchOptions: SearchOptions = {
    topK: 5,
    semantic: true,
    filter: { kind: 'note' }
  };

  const id: string = await db.rememberTyped('hello', {
    type: rememberOptions.memoryType,
    tags: rememberOptions.tags,
    metadata: rememberOptions.metadata
  });
  const hits: SearchHit[] = await db.search('hello', searchOptions);
  const _recall = await fromEnv.recall([id]);

  void hits;
}

void run();
