import { useState } from "react";
import {
  Box,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Snackbar,
  Alert,
  Typography,
  Button,
  CircularProgress
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { fetcher } from "../util";
import { SearchBar } from "./SearchBar";
import { UploadVersionButton } from "./UploadVersion";

type PackageDisplay = {
  Name: string;
  Version: string;
  ID: string;
  NetScore?: number | "N/A";
  StandaloneCost?: number;
  TotalCost?: number;
  CostStatus?: string;
  UploadedWithContent: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assertIsPackageDisplay(o: any): asserts o is PackageDisplay {
  if (!o || typeof o !== "object") {
    throw new Error("Expected PackageDisplay to be an object");
  }
  if (typeof o.Name !== "string") {
    throw new Error(`Expected PackageDisplay.Name to be a string, but got ${typeof o.Name}`);
  }
  if (typeof o.Version !== "string") {
    throw new Error(`Expected PackageDisplay.Version to be a string, but got ${typeof o.Version}`);
  }
  if (typeof o.ID !== "string") {
    throw new Error(`Expected PackageDisplay.ID to be a string, but got ${typeof o.ID}`);
  }
  if (o.NetScore !== undefined && typeof o.NetScore !== "number" && o.NetScore !== "N/A") {
    throw new Error(`Expected PackageDisplay.NetScore to be a number or 'N/A', but got ${typeof o.NetScore}`);
  }
  if (o.StandaloneCost !== undefined && typeof o.StandaloneCost !== "number") {
    throw new Error(`Expected PackageDisplay.StandaloneCost to be a number, but got ${typeof o.StandaloneCost}`);
  }
  if (o.TotalCost !== undefined && typeof o.TotalCost !== "number") {
    throw new Error(`Expected PackageDisplay.TotalCost to be a number, but got ${typeof o.TotalCost}`);
  }
  if (o.CostStatus !== undefined && typeof o.CostStatus !== "string") {
    throw new Error(`Expected PackageDisplay.CostStatus to be a string, but got ${typeof o.CostStatus}`);
  }
}

function Row(props: { row: PackageDisplay[] }) {
  const { row } = props;
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow sx={{ "& > *": { borderBottom: "1px solid gray" } }}>
        <TableCell sx={{ width: "40px", padding: "8px" }}>
          <IconButton aria-label="expand row" size="small" onClick={() => setOpen(!open)}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell component="th" scope="row" sx={{ fontWeight: "bold", fontSize: "1.1rem" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {row[0].Name}
            <UploadVersionButton
              id={row[0].ID}
              name={row[0].Name}
              version={row[0].Version}
              uploadedWithContent={row[0].UploadedWithContent}
            />
          </Box>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0, borderBottom: "1px solid gray" }} colSpan={3}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ margin: "12px 16px" }}>
              <Table size="small" aria-label="versions" sx={{ borderCollapse: "collapse" }}>
                <TableHead>
                  <TableRow>
                    <TableCell
                      align="center"
                      sx={{
                        fontWeight: "bold",
                        fontSize: "1rem",
                        borderBottom: "1px solid gray"
                      }}>
                      Version Number
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{
                        fontWeight: "bold",
                        fontSize: "1rem",
                        borderBottom: "1px solid gray"
                      }}>
                      Package ID
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{
                        fontWeight: "bold",
                        fontSize: "1rem",
                        borderBottom: "1px solid gray"
                      }}>
                      Net Score
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {row.map((version) => (
                    <TableRow key={version.ID} sx={{ "&:last-child td, &:last-child th": { border: 0 } }}>
                      <TableCell align="center">{version.Version}</TableCell>
                      <TableCell align="center">{version.ID}</TableCell>
                      <TableCell align="center">{version.NetScore}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export function PackageTable() {
  const [rows, setRows] = useState<Record<string, PackageDisplay[]>>({});
  const [hasSearched, setHasSearched] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackBarMessage, setSnackBarMessage] = useState("");
  const [snackBarSeverity, setSnackBarSeverity] = useState<"error" | "warning" | "info" | "success">("warning");
  const [offset, setOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchMode, setSearchMode] = useState<"name" | "regex">("name");

  function setSnackBar(message: string, severity: "error" | "warning" | "info" | "success") {
    setSnackBarMessage(message);
    setSnackBarSeverity(severity);
    setSnackbarOpen(true);
  }

  const fetechUploadType = async (name: string) => {
    try {
      const response = await fetcher(`/content/${name}`, {
        method: "GET"
      });
      const data = await response.json();
      return data.uploadedWithContent;
    } catch (error) {
      console.error("Error fetching upload type:", error);
      setSnackBar("Error fetching upload type.", "error");
    }
  };

  const fetchViaName = async (searchValue: string, version?: string, fetchOffset = 0) => {
    try {
      version = version || "0.0.0-999999.999999.999999";
      const response = await fetcher("/packages", {
        method: "POST",
        headers: { offset: fetchOffset.toString(), allflag: "true", "content-type": "application/json" },
        body: JSON.stringify([{ Version: version, Name: searchValue }])
      });
      const data = await response.json();
      const groupedData: Record<string, PackageDisplay[]> = {};

      // Fetch all uploadedWithContent statuses in parallel
      const enrichedData = await Promise.all(
        data.map(async (pkg: PackageDisplay) => {
          assertIsPackageDisplay(pkg);
          const uploadedWithContent = await fetechUploadType(pkg.Name);
          return { ...pkg, UploadedWithContent: uploadedWithContent };
        })
      );

      // Group the data after enriching
      enrichedData.forEach((pkg) => {
        if (!groupedData[pkg.Name]) {
          groupedData[pkg.Name] = [];
        }
        groupedData[pkg.Name].push(pkg);
      });

      if (Object.keys(groupedData).length === 0 && fetchOffset === 0) {
        setSnackBar("No packages found for the given search term.", "warning");
        setRows({});
        setHasMore(false);
        return;
      }

      Object.keys(groupedData).forEach((packageName) => {
        groupedData[packageName].sort((a, b) => parseFloat(b.Version) - parseFloat(a.Version));
      });

      if (fetchOffset === 0) {
        setRows(groupedData);
      } else {
        setRows((prevRows) => {
          const updatedRows = { ...prevRows };
          Object.keys(groupedData).forEach((packageName) => {
            if (!updatedRows[packageName]) {
              updatedRows[packageName] = [];
            }
            updatedRows[packageName] = [...updatedRows[packageName], ...groupedData[packageName]];
          });
          return updatedRows;
        });
      }

      if (data.length < 15) {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Error fetching packages:", error);
      setSnackBar("Error fetching packages.", "error");
    }
  };

  const fetchViaRegex = async (searchValue: string, fetchOffset = 0) => {
    try {
      const response = await fetcher("/package/byRegEx", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          allflag: "true",
          offset: fetchOffset.toString()
        },
        body: JSON.stringify({ RegEx: searchValue })
      });
      const data = await response.json();
      if (response.status === 404 && fetchOffset === 0) {
        setSnackBar("No packages found for the given search term.", "warning");
        setRows({});
        setHasMore(false);
        return;
      }

      const groupedData: Record<string, PackageDisplay[]> = {};

      // Fetch uploadedWithContent in parallel
      const packagesWithContent = await Promise.all(
        data.map(async (pkg: PackageDisplay) => {
          assertIsPackageDisplay(pkg);
          const uploadedWithContent = await fetechUploadType(pkg.Name);
          return { ...pkg, UploadedWithContent: uploadedWithContent };
        })
      );

      packagesWithContent.forEach((pkg) => {
        if (!groupedData[pkg.Name]) {
          groupedData[pkg.Name] = [];
        }
        groupedData[pkg.Name].push(pkg);
      });

      Object.keys(groupedData).forEach((packageName) => {
        groupedData[packageName].sort((a, b) => parseFloat(b.Version) - parseFloat(a.Version));
      });

      if (fetchOffset === 0) {
        setRows(groupedData);
      } else {
        setRows((prevRows) => {
          const updatedRows = { ...prevRows };
          Object.keys(groupedData).forEach((packageName) => {
            if (!updatedRows[packageName]) {
              updatedRows[packageName] = [];
            }
            updatedRows[packageName] = [...updatedRows[packageName], ...groupedData[packageName]];
          });
          return updatedRows;
        });
      }

      if (data.length < 15) {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Error fetching packages by regex:", error);
      setSnackBar("Error fetching packages.", "error");
    }
  };

  const onSearch = (searchValue: string, searchByRegex: boolean, version?: string) => {
    setHasSearched(true);
    setOffset(0);
    setHasMore(true);
    setSearchMode(searchByRegex ? "regex" : "name");
    if (searchByRegex) {
      searchValue = searchValue.trim() === "" ? ".*" : searchValue;
      fetchViaRegex(searchValue);
    } else {
      searchValue = searchValue.trim() === "" ? "*" : searchValue;
      fetchViaName(searchValue, version);
    }
  };

  const loadMore = () => {
    if (!hasMore) return;
    setIsLoadingMore(true);
    const nextOffset = offset + 15;
    setOffset(nextOffset);
    if (searchMode === "regex") {
      fetchViaRegex(".*", nextOffset).finally(() => setIsLoadingMore(false));
    } else {
      fetchViaName("*", undefined, nextOffset).finally(() => setIsLoadingMore(false));
    }
  };

  return (
    <>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={5000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert onClose={() => setSnackbarOpen(false)} severity={snackBarSeverity} sx={{ width: "100%" }}>
          <Typography>{snackBarMessage}</Typography>
        </Alert>
      </Snackbar>
      <SearchBar onSearch={onSearch} />
      <Collapse in={hasSearched && Object.keys(rows).length > 0} timeout={600} sx={{ width: "70%" }}>
        <TableContainer component={Paper} sx={{ marginTop: 2, borderRadius: 2, outline: "1px solid gray" }}>
          <Table aria-label="collapsible table">
            <TableHead>
              <TableRow sx={{ backgroundColor: "primary.main" }}>
                <TableCell sx={{ width: "40px" }} />
                <TableCell sx={{ color: "white", fontWeight: "bold", fontSize: "1.2rem" }}>Package Name</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.keys(rows).map((packageName) => (
                <Row key={packageName} row={rows[packageName]} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ textAlign: "center", marginTop: 2 }}>
          {hasMore && (
            <Button
              variant="contained"
              color="primary"
              onClick={loadMore}
              disabled={isLoadingMore}
              startIcon={isLoadingMore && <CircularProgress size={20} color="inherit" />}
              sx={{ marginBottom: 2, textTransform: "none", padding: "8px 16px", fontSize: "1rem" }}>
              {isLoadingMore ? "Loading..." : "Load More"}
            </Button>
          )}
        </Box>
      </Collapse>
    </>
  );
}
