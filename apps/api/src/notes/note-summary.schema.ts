import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";

/** AI-generated summary of a note, stored in MongoDB (database getsetgo_api). */
@Schema({ collection: "note_summaries", timestamps: { createdAt: true, updatedAt: false } })
export class NoteSummaryDoc {
  @Prop({ required: true, index: true })
  noteId: string;

  /** The note's owner, so account deletion can remove every summary (FR-018). */
  @Prop({ required: true, index: true })
  ownerId: string;

  @Prop({ required: true })
  summary: string;

  @Prop({ type: [String], default: [] })
  keyPoints: string[];

  @Prop({ required: true })
  model: string;

  /** ID of the run in apps/ai, for tracing a summary back to its Claude call. */
  @Prop({ required: true })
  runId: string;

  createdAt: Date;
}

export type NoteSummaryDocument = HydratedDocument<NoteSummaryDoc>;
export const NoteSummarySchema = SchemaFactory.createForClass(NoteSummaryDoc);
