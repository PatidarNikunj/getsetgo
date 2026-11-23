import { NotFoundException } from "@nestjs/common";
import type { Model } from "mongoose";

import type { AiClientService } from "../ai/ai-client.service";
import type { CacheService } from "../cache/cache.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { NoteSummaryDoc } from "./note-summary.schema";
import { NotesService } from "./notes.service";

const note = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Trip",
  content: "Lisbon in May",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function setup() {
  const prisma = {
    note: {
      findMany: jest.fn().mockResolvedValue([note]),
      findUnique: jest.fn().mockResolvedValue(note),
      create: jest.fn().mockResolvedValue(note),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
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
    deleteMany: jest.fn(),
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

    const result = await service.list({ take: 20, skip: 0 });

    expect(result[0]?.createdAt).toBeInstanceOf(Date);
    expect(prisma.note.findMany).not.toHaveBeenCalled();
  });

  it("loads from Postgres on a cache miss and caches the page", async () => {
    const { service, prisma, cache } = setup();

    await service.list({ take: 20, skip: 0 });

    expect(prisma.note.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: 0,
    });
    expect(cache.set).toHaveBeenCalledWith("notes:list:20:0", [note], 60);
  });

  it("invalidates cached lists when a note is created or deleted", async () => {
    const { service, cache, summaries } = setup();

    await service.create({ title: "T", content: "C" });
    await service.delete(note.id);

    expect(cache.invalidate).toHaveBeenCalledTimes(2);
    expect(summaries.deleteMany).toHaveBeenCalledWith({ noteId: note.id });
  });

  it("throws NotFound for unknown notes", async () => {
    const { service, prisma } = setup();
    prisma.note.findUnique.mockResolvedValue(null);
    prisma.note.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.get(note.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.delete(note.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("summarizes via the AI service and stores the result in Mongo", async () => {
    const { service, ai, summaries } = setup();

    const result = await service.summarize(note.id, "req-9");

    expect(ai.summarize).toHaveBeenCalledWith(
      { note_id: note.id, title: "Trip", content: "Lisbon in May" },
      "req-9",
    );
    expect(summaries.create).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: note.id, runId: "run-1" }),
    );
    expect(result.summary?.keyPoints).toEqual(["May"]);
  });
});
