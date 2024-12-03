/*
  This component displays the packages in a table format.
  It fetches the packages from the backend and displays them in a collapsible table format.
  The user can search for packages by name or regex.
  The user can also upload a new package by clicking the "Upload" button.
  The user can download a package by clicking the "Download" button.
  The user can view the details of a package by clicking the "Details" button.
  Details comes from the PackageDialog component.
*/
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
import { UploadPackageForm } from "./UploadPackage";
import { DownloadButton } from "./DownloadButton";
import { PackageDialog } from "./PackageDialogue";

type PackageDisplay = {
  Name: string;
  Version: string;
  ID: string;
  NetScore: number;
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
  if (o.NetScore !== undefined && typeof o.NetScore !== "number") {
    throw new Error(`Expected PackageDisplay.NetScore to be a number, but got ${typeof o.NetScore}`);
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
  if (o.UploadedWithContent !== undefined && typeof o.UploadedWithContent !== "boolean") {
    throw new Error(
      `Expected PackageDisplay.UploadedWithContent to be a boolean, but got ${typeof o.UploadedWithContent}`
    );
  }
}

function Row(props: { row: PackageDisplay[] }) {
  const { row } = props;
  const [open, setOpen] = useState(false);

  function VersionRow({ version }: { version: PackageDisplay }) {
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleOpenDialog = () => {
      setDialogOpen(true);
    };

    const handleCloseDialog = () => {
      setDialogOpen(false);
    };
    return (
      <>
        <TableRow
          key={version.ID}
          sx={{
            "&:last-child td, &:last-child th": { border: 0 },
            "&:hover": {
              backgroundColor: "rgba(0, 0, 0, 0.04)"
            }
          }}>
          <TableCell align="center">{version.Version}</TableCell>
          <TableCell align="center">{version.ID}</TableCell>
          <TableCell align="center">{version.NetScore}</TableCell>
          <TableCell align="center">
            <Button variant="outlined" size="small" onClick={handleOpenDialog}>
              Details
            </Button>
          </TableCell>
          <TableCell align="center">
            <DownloadButton id={version.ID} />
          </TableCell>
        </TableRow>
        <PackageDialog open={dialogOpen} onClose={handleCloseDialog} packageData={version} />
      </>
    );
  }

  return (
    <>
      <TableRow
        sx={{
          "& > *": {},
          "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" }
        }}
        onClick={() => setOpen(!open)}>
        <TableCell sx={{ width: "40px", padding: 1 }}>
          <IconButton aria-label="expand row" size="small" onClick={() => setOpen(!open)}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>

        <TableCell
          component="th"
          scope="row"
          sx={{
            fontWeight: "bold",
            fontSize: "1.1rem",
            padding: "8px 16px"
          }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
            {row[0].Name}
            <UploadPackageForm
              uploadVersion={true}
              id={row[0].ID}
              name={row[0].Name}
              version={row[0].Version}
              uploadedWithContent={row[0].UploadedWithContent}
            />
          </Box>
        </TableCell>
      </TableRow>

      <TableRow>
        <TableCell
          sx={{
            paddingBottom: 0,
            paddingTop: 0,
            borderBottom: "1px solid gray"
          }}
          colSpan={3}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box
              sx={{
                margin: "12px 16px",
                padding: 2,
                boxShadow: 2,
                borderRadius: 2,
                backgroundColor: "#f9f9f9"
              }}>
              <Table size="small" aria-label="versions" sx={{ borderCollapse: "collapse" }}>
                <TableHead>
                  <TableRow>
                    {["Version Number", "Package ID", "Net Score", "Details", "Download"].map((header) => (
                      <TableCell
                        key={header}
                        align="center"
                        sx={{
                          fontWeight: "bold",
                          fontSize: "1rem",
                          borderBottom: "1px solid gray"
                        }}>
                        {header}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {row.map((version) => (
                    <VersionRow key={version.ID} version={version} />
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

      data.forEach((pkg: PackageDisplay) => {
        assertIsPackageDisplay(pkg);
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

      // Sort each package's versions in descending order by Version number
      Object.keys(groupedData).forEach((packageName) => {
        groupedData[packageName].sort((a, b) => parseFloat(b.Version) - parseFloat(a.Version));
      });
      if (fetchOffset === 0) {
        // First load
        setRows(groupedData);
      } else {
        // Append to existing rows
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
      } else {
        setHasMore(true);
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
      data.forEach((pkg: PackageDisplay) => {
        assertIsPackageDisplay(pkg);
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
      } else {
        setHasMore(true);
      }
    } catch (error) {
      console.error("Error fetching packages by regex:", error);
      setSnackBar("Error fetching packages.", "error");
    }
  };

  const onSearch = (searchValue: string, searchByRegex: boolean, version?: string) => {
    setHasSearched(true);
    setOffset(0);
    setSearchMode(searchByRegex ? "regex" : "name");
    searchValue = searchValue.trim();
    if (searchByRegex) {
      searchValue = searchValue === "" ? ".*" : searchValue;
      fetchViaRegex(searchValue);
    } else {
      searchValue = searchValue === "" ? "*" : searchValue;
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

      <Collapse in={hasSearched && Object.keys(rows).length > 0} timeout={600} sx={{ width: "95%" }}>
        <TableContainer component={Paper} sx={{ marginTop: 2, borderRadius: 0.5, outline: "1px solid gray" }}>
          <Table aria-label="collapsible table">
            <TableHead></TableHead>
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
