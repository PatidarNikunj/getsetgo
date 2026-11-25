import { Field, ID, ObjectType, registerEnumType } from "@nestjs/graphql";

import { AuthProvider } from "../generated/prisma/enums";

registerEnumType(AuthProvider, { name: "AuthProvider", description: "Where the user signed in" });

@ObjectType({ description: "The signed-in user (only ever yourself)" })
export class Viewer {
  @Field(() => ID)
  id: string;

  @Field()
  displayName: string;

  @Field(() => String, {
    nullable: true,
    description: "Only if the provider shared a verified email",
  })
  email: string | null;

  @Field(() => String, { nullable: true })
  avatarUrl: string | null;

  @Field(() => AuthProvider)
  provider: AuthProvider;

  @Field(() => String, {
    nullable: true,
    description: "Provider username (GitHub/test), shown when there is no email",
  })
  login: string | null;

  @Field()
  createdAt: Date;
}
