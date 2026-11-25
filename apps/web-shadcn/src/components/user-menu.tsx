"use client";

import { AUTH_PATH, describeError, PROVIDER_NAMES } from "@getsetgo/graphql";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutEverywhere } from "@/lib/account";
import type { Viewer } from "@/lib/session.server";

const SIGN_OUT_FORM = "sign-out-form";

/** Header account menu: who's signed in, account page, sign out, sign out everywhere. */
export function UserMenu({ viewer }: { viewer: Pick<Viewer, "displayName" | "provider"> }) {
  const queryClient = useQueryClient();
  const everywhere = useMutation({
    mutationFn: signOutEverywhere,
    onSuccess: () => {
      queryClient.clear();
      // A full page load on purpose: drops every bit of client state from the old session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/sign-in?signedOut=1");
    },
    onError: (error) => toast.error(describeError(error)),
  });

  return (
    <>
      {/* A native form: signing out works even before the page is interactive. */}
      <form id={SIGN_OUT_FORM} method="post" action={`${AUTH_PATH}/sign-out`} hidden />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="lg">
            {/* WCAG 2.5.3: the accessible name includes the visible text ("Account menu: Ada via Google"). */}
            <span className="sr-only">Account menu: </span>
            <span className="flex flex-col items-start leading-tight">
              <span className="max-w-40 truncate font-medium">{viewer.displayName}</span>
              <span className="text-xs text-muted-foreground">
                via {PROVIDER_NAMES[viewer.provider]}
              </span>
            </span>
            <ChevronDownIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuLabel>Signed in with {PROVIDER_NAMES[viewer.provider]}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/account">Account</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <button type="submit" form={SIGN_OUT_FORM} className="w-full">
              Sign out
            </button>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={everywhere.isPending} onSelect={() => everywhere.mutate()}>
            Sign out everywhere
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
