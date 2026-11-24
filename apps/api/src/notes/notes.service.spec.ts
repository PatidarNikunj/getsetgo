import { NotFoundException } from "@nestjs/common";
import type { Model } from "mongoose";

import type { AiClientService } from "../ai/ai-client.service";
import type { CacheService } from "../cache/cache.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { NoteSummaryDoc } from "./note-summary.schema";
import { NotesService } from "./notes.service";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const note = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerId: OWNER,
  title: "Trip",
  content: "Lisbon in May",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function setup() {
  const prisma = {
    note: {
      findMany: jest.fn().mockResolvedValue([note]),
      findFirst: jest.fn().mockResolvedValue(note),
      create: jest.fn().mockResolvedValue(note),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ id: OWNER }) },
  };
  const cache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn(),
    invalidate: jest.fn(),
  };
  const ai = {
    summarize: jest.fn().mockResolvedValue({
      run_id: "run-1",
      summary: "Trip to Lisbon",
      key_points: ["May"],
      model: "claude-opus-5-5",
      input_tokens: 10,
      output_tokens: 5,
    }),
  };
  const summaries = {
    create: jest.fn().mockImplementation((doc: object) => ({ ...doc, createdAt: new Date() })),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
  };
  const service = new NotesService(
    prisma as unknown as PrismaService,
    cache as unknown as CacheService,
    ai as unknown as AiClientService,
    summaries as unknown as Model<NoteSummaryDoc>,
  );
  return { service, prisma, cache, ai, summaries };
}

describe("NotesService", () => {
  it("serves the list from Redis when cached, without hitting Postgres", async () => {
    const { service, prisma, cache } = setup();
    cache.get.mockResolvedValue([
      { ...note, createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString() },
    ]);

    const result = await service.list(OWNER, { take: 20, skip: 0 });

    expect(result[0]?.createdAt).toBeInstanceOf(Date);
    expect(prisma.note.findMany).not.toHaveBeenCalled();
  });

  it("loads from Postgres on a cache miss and caches the page", async () => {
    const { service, prisma, cache } = setup();

    await service.list(OWNER, { take: 20, skip: 0 });

    expect(prisma.note.findMany).toHaveBeenCalledWith({
      where: { ownerId: OWNER },
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: 0,
    });
    expect(cache.set).toHaveBeenCalledWith(`notes:list:${OWNER}:20:0`, [note], 60);
  });

  it("invalidates cached lists when a note is created or deleted", async () => {
    const { service, cache, summaries } = setup();

    await service.create(OWNER, { title: "T", content: "C" });
    await service.delete(OWNER, note.id);

    expect(cache.invalidate).toHaveBeenCalledTimes(2);
    expect(cache.invalidate).toHaveBeenCalledWith(`notes:list:${OWNER}:`);
    expect(summaries.deleteMany).toHaveBeenCalledWith({ noteId: note.id });
  });

  it("throws NotFound for unknown notes", async () => {
    const { service, prisma } = setup();
    prisma.note.findFirst.mockResolvedValue(null);
    prisma.note.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.get(OWNER, note.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.delete(OWNER, note.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("only ever queries the caller's notes (another user's note looks missing)", async () => {
    const { service, prisma } = setup();
    prisma.note.findFirst.mockResolvedValue(null);
    prisma.note.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.get(OTHER, note.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.note.findFirst).toHaveBeenCalledWith({ where: { id: note.id, ownerId: OTHER } });
    await expect(service.delete(OTHER, note.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.note.deleteMany).toHaveBeenCalledWith({ where: { id: note.id, ownerId: OTHER } });
    await expect(service.summarize(OTHER, note.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates notes owned by the caller, and refuses once the user is gone", async () => {
    const { service, prisma } = setup();
    await service.create(OWNER, { title: "T", content: "C" });
    expect(prisma.note.create).toHaveBeenCalledWith({
      data: { title: "T", content: "C", ownerId: OWNER },
    });
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.create(OWNER, { title: "T", content: "C" })).rejects.toThrow(/Sign in/);
  });

  it("purges summaries written before notes had owners", async () => {
    const { service, summaries } = setup();
    await service.onApplicationBootstrap();
    expect(summaries.deleteMany).toHaveBeenCalledWith({ ownerId: { $exists: false } });
  });

  it("summarizes via the AI service and stores the result in Mongo", async () => {
    const { service, ai, summaries } = setup();

    const result = await service.summarize(OWNER, note.id, "req-9");

    expect(ai.summarize).toHaveBeenCalledWith(
      { note_id: note.id, title: "Trip", content: "Lisbon in May" },
      "req-9",
    );
    expect(summaries.create).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: note.id, ownerId: OWNER, runId: "run-1" }),
    );
    expect(result.summary?.keyPoints).toEqual(["May"]);
  });
});
