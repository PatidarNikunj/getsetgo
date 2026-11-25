import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { NoteSummaryDoc, NoteSummarySchema } from "../notes/note-summary.schema";
import { AccountService } from "./account.service";
import { AuthController } from "./auth.controller";
import { AuthResolver } from "./auth.resolver";
import { GitHubProvider } from "./providers/github.provider";
import { GoogleProvider } from "./providers/google.provider";
import { TestProvider } from "./providers/test.provider";
import { RecaptchaService } from "./recaptcha.service";
import { SessionsService } from "./sessions.service";
import { TokensService } from "./tokens.service";

/** Sign-in with Google/GitHub, sessions and accounts (specs/001-oauth-login). */
@Module({
  imports: [MongooseModule.forFeature([{ name: NoteSummaryDoc.name, schema: NoteSummarySchema }])],
  controllers: [AuthController],
  providers: [
    TokensService,
    SessionsService,
    AccountService,
    RecaptchaService,
    GoogleProvider,
    GitHubProvider,
    TestProvider,
    AuthResolver,
  ],
  // TokensService: the global DenyByDefaultGuard verifies access cookies with it.
  exports: [TokensService],
})
export class AuthModule {}
