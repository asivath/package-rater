import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Alert
} from "@mui/material";
import { fetcher } from "../util";

type PackageDisplay = {
  Name: string;
  Version: string;
  ID: string;
  NetScore: number;
  CostStatus?: string;
  UploadedWithContent: boolean;
  StandaloneCost?: number;
  TotalCost?: number;
};

interface PackageCostData {
  totalCost?: number;
}

interface PackageDialogProps {
  open: boolean;
  onClose: () => void;
  packageData: PackageDisplay;
}

export const PackageDialog: React.FC<PackageDialogProps> = ({ open, onClose, packageData }) => {
  const [costData, setCostData] = useState<PackageCostData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const fetchCostData = async () => {
        setLoading(true);
        setError(null);

        try {
          const response = await fetcher(`/package/${packageData.ID}/cost`);
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error ${response.status}: ${errorText}`);
          }
          const data = await response.json();
          setCostData(data[packageData.ID]);
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setLoading(false);
        }
      };

      fetchCostData();
    } else {
      setCostData(null);
      setError(null);
    }
  }, [open, packageData.ID]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{`Package Details - ${packageData.Name} v${packageData.Version}`}</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
            <CircularProgress />
          </div>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <List>
            <ListItem>
              <ListItemText primary="Name" secondary={packageData.Name} />
            </ListItem>
            <ListItem>
              <ListItemText primary="Version" secondary={packageData.Version} />
            </ListItem>
            <ListItem>
              <ListItemText primary="ID" secondary={packageData.ID} />
            </ListItem>
            <ListItem>
              <ListItemText primary="Net Score" secondary={packageData.NetScore} />
            </ListItem>
            <ListItem>
              <ListItemText primary="Standalone Cost" secondary={`${packageData.StandaloneCost?.toFixed(2)} MB`} />
            </ListItem>
            {costData?.totalCost !== undefined && (
              <ListItem>
                <ListItemText primary="Total Cost" secondary={`${costData.totalCost?.toFixed(2)} MB`} />
              </ListItem>
            )}
            <ListItem>
              <ListItemText
                primary="Uploaded With Content"
                secondary={packageData.UploadedWithContent ? "Yes" : "No"}
              />
            </ListItem>
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary" variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
