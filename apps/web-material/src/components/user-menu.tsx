"use client";

import { useMutation } from "@apollo/client/react";
import { AUTH_PATH, PROVIDER_NAMES, SignOutEverywhereDocument } from "@getsetgo/graphql";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import NextLink from "next/link";
import { useId, useState } from "react";

import { describeApolloError } from "@/lib/errors";
import type { Viewer } from "@/lib/session.server";
import { useAppDispatch } from "@/store/store";
import { notify } from "@/store/ui-slice";

const SIGN_OUT_FORM = "sign-out-form";

/** Header account menu: who's signed in, account page, sign out, sign out everywhere. */
export function UserMenu({ viewer }: { viewer: Pick<Viewer, "displayName" | "provider"> }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const dispatch = useAppDispatch();
  const [signOutEverywhere, { loading, client }] = useMutation(SignOutEverywhereDocument, {
    onCompleted: async () => {
      await client.clearStore();
      // A full page load on purpose: drops every bit of client state from the old session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/sign-in?signedOut=1");
    },
    onError: (error) => dispatch(notify(describeApolloError(error), "error")),
  });
  const close = () => setAnchor(null);

  return (
    <>
      {/* A native form: signing out works even before the page is interactive. */}
      <form id={SIGN_OUT_FORM} method="post" action={`${AUTH_PATH}/sign-out`} hidden />
      <Button
        aria-haspopup="menu"
        aria-controls={anchor ? menuId : undefined}
        aria-expanded={anchor ? "true" : undefined}
        endIcon={<ExpandMoreIcon aria-hidden="true" />}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ textTransform: "none", textAlign: "left", lineHeight: 1.2 }}
      >
        {/* WCAG 2.5.3: the accessible name includes the visible text ("Account menu: Ada via Google"). */}
        <span className="visually-hidden">Account menu: </span>
        <span>
          <span style={{ display: "block", fontWeight: 600 }}>{viewer.displayName}</span>
          <span style={{ display: "block", fontSize: "0.75rem", opacity: 0.8 }}>
            via {PROVIDER_NAMES[viewer.provider]}
          </span>
        </span>
      </Button>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={!!anchor}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem component={NextLink} href="/account" onClick={close}>
          Account
        </MenuItem>
        <MenuItem component="button" type="submit" form={SIGN_OUT_FORM} sx={{ width: "100%" }}>
          Sign out
        </MenuItem>
        <MenuItem
          disabled={loading}
          onClick={() => {
            close();
            void signOutEverywhere();
          }}
        >
          Sign out everywhere
        </MenuItem>
      </Menu>
    </>
  );
}
