import React, { useState, useRef } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Alert,
  Fade,
  IconButton,
  Icon,
  Tooltip
} from "@mui/material";
import { fetcher } from "../util";
import DriveFolderUploadIcon from "@mui/icons-material/DriveFolderUpload";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";

export const UploadPackageForm: React.FC<{
  uploadVersion: boolean;
  id?: string;
  name?: string;
  version?: string;
  uploadedWithContent?: boolean;
}> = ({ uploadVersion, id, name, version, uploadedWithContent }) => {
  const [file, setFile] = useState<File | null>(null);
  const [packageUrl, setPackageUrl] = useState("");
  const [uploadPackageFormOpen, setUploadPackageFormOpen] = useState(false);
  const [debloat, setDebloat] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    setError(null);
    setSuccess(false);
    setLoading(true);
    event.preventDefault();
    if (!file && !packageUrl) {
      setError("Please select a file or enter a URL");
      setLoading(false);
      return;
    }
    if (file && packageUrl) {
      setError("Provide either a file or a URL, not both");
      setLoading(false);
      return;
    }
    let body;
    let endpoint;
    if (!uploadVersion) {
      body = { debloat: debloat } as { Content?: string; URL?: string; debloat: boolean };
    } else {
      body = {
        metadata: { Name: name, Version: version, ID: id },
        data: { debloat: debloat }
      };
    }
    try {
      if (!uploadVersion) {
        endpoint = "/package";
        if (file) {
          (body as { Content?: string }).Content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              const base64String = result.split(",")[1];
              resolve(base64String);
            };
            reader.onerror = () => reject("Error reading file");
            reader.readAsDataURL(file);
          });
        } else if (packageUrl) {
          (body as { URL?: string }).URL = packageUrl;
        }
      } else {
        endpoint = `/package/${id}`;
        if (file) {
          (
            body as {
              metadata: { Name: string; Version: string; ID: string };
              data: { debloat: boolean; Content?: string };
            }
          ).data.Content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              const base64String = result.split(",")[1];
              resolve(base64String);
            };
            reader.onerror = () => reject("Error reading file");
            reader.readAsDataURL(file);
          });
        } else if (packageUrl) {
          (
            body as {
              metadata: { Name: string; Version: string; ID: string };
              data: { debloat: boolean; URL?: string };
            }
          ).data.URL = packageUrl;
        }
      }
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        switch (response.status) {
          case 409:
            setError("Package already exists");
            break;
          case 424:
            setError("Package is not uploaded due to the disqualified rating");
            break;
          case 500:
            setError("Error saving the package");
            break;
          default:
            setError("An unknown error occurred");
            break;
        }
        return;
      }
      setSuccess(true);
      setPackageUrl("");
      setFile(null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleExited = () => {
    setFile(null);
    setPackageUrl("");
    setDebloat(false);
    setError(null);
    setSuccess(false);
  };

  return (
    <Box>
      {uploadVersion ? (
        <IconButton aria-label="perform action" color="primary" onClick={() => setUploadPackageFormOpen(true)}>
          {uploadedWithContent ? (
            <Tooltip title="Upload Content Version" arrow>
              <DriveFolderUploadIcon />
            </Tooltip>
          ) : (
            <Tooltip title="Upload URL Version" arrow>
              <Box>
                <Icon fontSize="large">
                  <CloudUploadIcon />
                </Icon>
              </Box>
            </Tooltip>
          )}
        </IconButton>
      ) : (
        <Button
          color="secondary"
          component="label"
          sx={{
            marginLeft: "auto",
            background: "none",
            backgroundClip: "text",
            textFillColor: "transparent",
            backgroundImage: "linear-gradient(45deg, #FE6B8B 30%, #FF8E53 90%)"
          }}
          onClick={() => setUploadPackageFormOpen(true)}>
          Upload Package
        </Button>
      )}
      <Dialog
        open={uploadPackageFormOpen}
        onClose={() => setUploadPackageFormOpen(false)}
        TransitionComponent={Fade}
        TransitionProps={{ onExited: handleExited }}>
        {loading && (
          <Box
            position="absolute"
            width="100%"
            height="100%"
            top={0}
            left={0}
            display="flex"
            justifyContent="center"
            alignItems="center"
            bgcolor={"rgba(255, 255, 255, 0.7)"}
            zIndex={1000}>
            <CircularProgress />
          </Box>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Package uploaded successfully
          </Alert>
        )}
        {!uploadVersion ? <DialogTitle>Upload Package</DialogTitle> : <DialogTitle>Upload {name} Version</DialogTitle>}
        <DialogContent>
          <Box component="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={2} width="400px">
            {(uploadedWithContent || !uploadVersion) && (
              <>
                <Button variant="outlined" component="label">
                  Upload ZIP File
                  <input hidden type="file" accept=".zip" ref={fileInputRef} onChange={handleFileUpload} />
                </Button>
                {file && (
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" noWrap>
                      Selected file: {file.name}
                    </Typography>
                    <Button
                      variant="contained"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                      color="secondary">
                      Clear File
                    </Button>
                  </Box>
                )}
              </>
            )}
            {!uploadVersion && <Divider>OR</Divider>}
            {(!uploadedWithContent || !uploadVersion) && (
                <Box mt={2}>
                <TextField
                  label="GitHub / npm URL"
                  variant="outlined"
                  fullWidth
                  placeholder="Enter URL to GitHub or npm package"
                  value={packageUrl}
                  onChange={(e) => setPackageUrl(e.target.value)}
                />
                </Box>
            )}
            <FormControlLabel
              control={
                <Checkbox
                  checked={debloat}
                  onChange={(e) => setDebloat(e.target.checked)}
                  name="debloat"
                  color="primary"
                />
              }
              label="Enable Debloat"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadPackageFormOpen(false)}>Cancel</Button>
          <Button type="submit" variant="contained" color="primary" onClick={handleSubmit}>
            Submit
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
