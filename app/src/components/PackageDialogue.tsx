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
  Alert,
  Box
} from "@mui/material";
import { fetcher } from "../util";
import { Ndjson } from "@package-rater/shared";

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
  const [netScoreData, setNetScoreData] = useState<Ndjson | null>(null);

  useEffect(() => {
    if (open) {
      const fetchCostScoreData = async () => {
        setLoading(true);
        setError(null);
        try {
          // Fetch1 for cost data for the package
          const response = await fetcher(`/package/${packageData.ID}/cost`);
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error ${response.status}: ${errorText}`);
          }
          const data = await response.json();
          setCostData(data[packageData.ID]);

          // Fetch2 for net score data for the package
          const response2 = await fetcher(`/package/${packageData.ID}/rate`);
          if (!response2.ok) {
            const errorText = await response2.text();
            throw new Error(`Error ${response2.status}: ${errorText}`);
          }
          const netScoreData = await await response2.json();
          setNetScoreData(netScoreData);
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setLoading(false);
        }
      };
      fetchCostScoreData();
    } else {
      setCostData(null);
      setNetScoreData(null);
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
              <Box
                display="grid"
                gridTemplateColumns="repeat(2, 1fr)" // 2 columns of equal width
                columnGap={2} // Spacing between columns
                rowGap={1} // Spacing between rows
                width="100%" // Ensures full-width content
              >
                <ListItemText primary="Version" secondary={packageData.Version} />
                <ListItemText primary="ID" secondary={packageData.ID} />
              </Box>
            </ListItem>
            <ListItem>
              <Box display="grid" gridTemplateColumns="repeat(2, 1fr)" columnGap={2} rowGap={1} width="100%">
                <ListItemText primary="Name" secondary={packageData.Name} />
                <ListItemText
                  primary="Uploaded With Content"
                  secondary={packageData.UploadedWithContent ? "Yes" : "No"}
                />
              </Box>
            </ListItem>
            <ListItem>
              <Box display="grid" gridTemplateColumns="repeat(2, 1fr)" columnGap={2} rowGap={1} width="100%">
                <ListItemText primary="Standalone Cost" secondary={`${packageData.StandaloneCost?.toFixed(2)} MB`} />
                {costData?.totalCost !== undefined && (
                  <ListItemText primary="Total Cost" secondary={`${costData.totalCost?.toFixed(2)} MB`} />
                )}
              </Box>
            </ListItem>
            {netScoreData && (
              <>
                <ListItem>
                  <Box display="grid" gridTemplateColumns="repeat(2, 1fr)" columnGap={2} rowGap={1} width="100%">
                    <ListItemText primary="Netscore" secondary={netScoreData.NetScore} />
                    <ListItemText primary="Netscore Latency" secondary={netScoreData.NetScore_Latency} />
                  </Box>
                </ListItem>
                <ListItem>
                  <Box display="grid" gridTemplateColumns="repeat(2, 1fr)" columnGap={2} rowGap={1} width="100%">
                    <ListItemText primary="Bus Factor" secondary={netScoreData.BusFactor} />
                    <ListItemText primary="Bus Factor Latency" secondary={netScoreData.BusFactor_Latency} />
                  </Box>
                </ListItem>
                <ListItem>
                  <Box display="grid" gridTemplateColumns="repeat(2, 1fr)" columnGap={2} rowGap={1} width="100%">
                    <ListItemText primary="Correctness" secondary={netScoreData.Correctness} />
                    <ListItemText primary="Correctness Latency" secondary={netScoreData.Correctness_Latency} />
                  </Box>
                </ListItem>
                <ListItem>
                  <Box display="grid" gridTemplateColumns="repeat(2, 1fr)" columnGap={2} rowGap={1} width="100%">
                    <ListItemText primary="Ramp Up" secondary={netScoreData.RampUp} />
                    <ListItemText primary="Ramp Up Latency" secondary={netScoreData.RampUp_Latency} />
                  </Box>
                </ListItem>
                <ListItem>
                  <Box display="grid" gridTemplateColumns="repeat(2, 1fr)" columnGap={2} rowGap={1} width="100%">
                    <ListItemText primary="Responsive Maintainer" secondary={netScoreData.ResponsiveMaintainer} />
                    <ListItemText
                      primary="Responsive Maintainer Latency"
                      secondary={netScoreData.ResponsiveMaintainer_Latency}
                    />
                  </Box>
                </ListItem>
                <ListItem>
                  <Box display="grid" gridTemplateColumns="repeat(2, 1fr)" columnGap={2} rowGap={1} width="100%">
                    <ListItemText primary="License" secondary={netScoreData.License} />
                    <ListItemText primary="License Latency" secondary={netScoreData.License_Latency} />
                  </Box>
                </ListItem>
                <ListItem>
                  <Box display="grid" gridTemplateColumns="repeat(2, 1fr)" columnGap={2} rowGap={1} width="100%">
                    <ListItemText primary="Good Pinning Practice" secondary={netScoreData.GoodPinningPractice} />
                    <ListItemText
                      primary="Good Pinning Practice Latency"
                      secondary={netScoreData.GoodPinningPracticeLatency}
                    />
                  </Box>
                </ListItem>
                <ListItem>
                  <Box display="grid" gridTemplateColumns="repeat(2, 1fr)" columnGap={2} rowGap={1} width="100%">
                    <ListItemText primary="Pull Request" secondary={netScoreData.PullRequest} />
                    <ListItemText primary="Pull Request Latency" secondary={netScoreData.PullRequest_Latency} />
                  </Box>
                </ListItem>
              </>
            )}
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