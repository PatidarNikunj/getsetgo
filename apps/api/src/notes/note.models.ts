import { Field, ID, InputType, Int, ObjectType } from "@nestjs/graphql";
import { Transform } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

// ---------- Output types ----------

@ObjectType({ description: "An AI-generated summary of a note" })
export class NoteSummary {
  @Field()
  summary: string;

  @Field(() => [String])
  keyPoints: string[];

  @Field({ description: "Claude model that wrote the summary" })
  model: string;

  @Field()
  createdAt: Date;
}

@ObjectType({ description: "A personal note" })
export class Note {
  @Field(() => ID)
  id: string;

  @Field()
  title: string;

  @Field()
  content: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Field(() => NoteSummary, { nullable: true, description: "Latest AI summary, if any" })
  summary?: NoteSummary | null;
}

// ---------- Inputs (validated before resolvers run, OWASP A03) ----------

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

@InputType()
export class CreateNoteInput {
  @Field()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  content: string;
}

@InputType()
export class NotesPageInput {
  @Field(() => Int, { defaultValue: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  take = 20;

  @Field(() => Int, { defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  skip = 0;
}
