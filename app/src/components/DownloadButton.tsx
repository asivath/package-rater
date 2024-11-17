import React from "react";
import { fetcher } from "../util";
import { Button } from "@mui/material";

interface DownloadButtonProps {
  id: string; // Accepts the id as a parameter
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({ id }) => {
  const handleDownload = async () => {
    try {
      // Use the id parameter to fetch the package
      const response = await fetcher(`/package/${id}`, { method: "GET" });
      const responseJson = await response.json();

      const { Name: name, Version: version } = responseJson.metadata;

      const streamToString = responseJson.data.Content;
      const byteArray = Uint8Array.from(atob(streamToString), (c) => c.charCodeAt(0));

      const blob = new Blob([byteArray], { type: "application/x-gtar-compressed" });

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${name}-${version}.tgz`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Download failed", error);
    }
  };

  return (
    <Button color="inherit" sx={{ marginLeft: "auto" }} onClick={handleDownload}>
      Download
    </Button>
  );
};
