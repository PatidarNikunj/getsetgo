"use client";

import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";

import { useAppDispatch, useAppSelector } from "@/store/store";
import { notificationDismissed } from "@/store/ui-slice";

/** Shows the current Redux notification. Errors use role="alert", others a polite status. */
export function NotificationSnackbar() {
  const notification = useAppSelector((s) => s.ui.notification);
  const dispatch = useAppDispatch();
  const close = () => dispatch(notificationDismissed());

  return (
    <Snackbar
      key={notification?.id}
      open={notification !== null}
      autoHideDuration={6000}
      onClose={(_event, reason) => reason !== "clickaway" && close()}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
    >
      {notification ? (
        <Alert
          onClose={close}
          severity={notification.severity}
          variant="filled"
          role={notification.severity === "error" ? "alert" : "status"}
          sx={{ width: "100%" }}
        >
          {notification.message}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
}
