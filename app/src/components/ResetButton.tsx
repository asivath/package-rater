/* 
  This component is used to reset the S3 bucket or local packages. 
  It will open a dialog to confirm the action before proceeding.
  The reset action will be triggered by a DELETE request to the server.
*/
import React, { useState } from "react";
import { fetcher } from "../util";
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, Typography } from "@mui/material";

export const ResetButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const isProd = import.meta.env.PROD;

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const reset = async () => {
    try {
      await fetcher("/reset", { method: "DELETE" });
      setOpen(false);
      window.location.reload();
    } catch {
      setOpen(false);
    }
  };

  return (
    <>
      <Button color="error" sx={{ marginLeft: "auto", mr: 3 }} onClick={handleClickOpen}>
        Reset
      </Button>
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Confirmation</DialogTitle>
        <DialogContent>
          <Typography>
            {isProd
              ? "Are you sure you want to reset the S3 bucket? This cannot be undone."
              : "Are you sure you want to reset the local packages? This cannot be undone."}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="secondary">
            No
          </Button>
          <Button onClick={reset} color="primary" autoFocus>
            Yes
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
