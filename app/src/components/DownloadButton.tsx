/*
 * DownloadButton component is a button that allows the user to download the package as a zip file
 */
import React from "react";
import { fetcher } from "../util";
import { IconButton, Tooltip } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";

interface DownloadButtonProps {
  id: string;
}

/**
 * This component is a button that allows the user to download the package as a zip file
 * @param param0 
 * @returns 
 */
export const DownloadButton: React.FC<DownloadButtonProps> = ({ id }) => {
  const handleDownload = async () => {
    try {
      // Use the id parameter to fetch the package
      const response = await fetcher(`/package/${id}`, { method: "GET" });

      const responseJson = await response.json();

      const { Name: name, Version: version } = responseJson.metadata;

      const streamToString = responseJson.data.Content;
      const byteArray = Uint8Array.from(atob(streamToString), (c) => c.charCodeAt(0));

      const blob = new Blob([byteArray], { type: "application/zip" });

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${name}-${version}.zip`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Download failed", error);
    }
  };

  return (
    <Tooltip title="Download Zip" arrow>
      <IconButton onClick={handleDownload}>
        <DownloadIcon />
      </IconButton>
    </Tooltip>
  );
};
