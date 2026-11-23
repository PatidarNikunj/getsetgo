import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { NoteSummaryDoc, NoteSummarySchema } from "./note-summary.schema";
import { NotesResolver } from "./notes.resolver";
import { NotesService } from "./notes.service";

@Module({
  imports: [MongooseModule.forFeature([{ name: NoteSummaryDoc.name, schema: NoteSummarySchema }])],
  providers: [NotesResolver, NotesService],
})
export class NotesModule {}
