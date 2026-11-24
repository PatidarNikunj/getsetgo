import { ParseUUIDPipe } from "@nestjs/common";
import {
  Args,
  Context,
  ID,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from "@nestjs/graphql";
import type { Request } from "express";
import { GraphQLError } from "graphql";

import { AiServiceError } from "../ai/ai-client.service";
import { AnalyticsService } from "../observability/analytics.service";
import { Public } from "../security/public.decorator";
import { CreateNoteInput, Note, NoteSummary, NotesPageInput } from "./note.models";
import { NotesService } from "./notes.service";

// Demo feature: public until the OAuth login spec adds users and ownership.
@Public()
@Resolver(() => Note)
export class NotesResolver {
  constructor(
    private readonly notes: NotesService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Query(() => [Note], { description: "Notes, newest first" })
  notesList(
    @Args("page", { type: () => NotesPageInput, nullable: true }) page?: NotesPageInput,
  ): Promise<Note[]> {
    return this.notes.list(page ?? new NotesPageInput());
  }

  @Query(() => Note)
  note(@Args("id", { type: () => ID }, ParseUUIDPipe) id: string): Promise<Note> {
    return this.notes.get(id);
  }

  @Mutation(() => Note)
  async createNote(
    @Args("input") input: CreateNoteInput,
    @Context("req") req: Request,
  ): Promise<Note> {
    const note = await this.notes.create(input);
    // Sizes only, never the text itself.
    this.analytics.track(req, "note_created", { content_length: input.content.length });
    return note;
  }

  @Mutation(() => Boolean)
  deleteNote(@Args("id", { type: () => ID }, ParseUUIDPipe) id: string): Promise<boolean> {
    return this.notes.delete(id);
  }

  @Mutation(() => Note, { description: "Summarize a note with Claude (via the AI service)" })
  async summarizeNote(
    @Args("id", { type: () => ID }, ParseUUIDPipe) id: string,
    @Context("req") req: Request,
  ): Promise<Note> {
    try {
      const note = await this.notes.summarize(id, req.id as string | undefined);
      this.analytics.track(req, "note_summarized", { model: note.summary?.model ?? "unknown" });
      return note;
    } catch (err) {
      if (err instanceof AiServiceError) {
        throw new GraphQLError(err.message, {
          extensions: { code: `AI_${err.kind.toUpperCase()}` },
        });
      }
      throw err;
    }
  }

  @ResolveField(() => NoteSummary, { nullable: true })
  summary(@Parent() note: Note): Promise<NoteSummary | null> | NoteSummary | null {
    // summarizeNote already returns the fresh summary; otherwise look up the latest one.
    return note.summary !== undefined ? note.summary : this.notes.latestSummary(note.id);
  }
}
