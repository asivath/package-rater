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
  Typography
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { fetcher } from "../util";
import { SearchBar } from "./SearchBar";

type PackageDisplay = {
  Name: string;
  Version: string;
  ID: string;
  NetScore?: number | "N/A";
  StandaloneCost?: number;
  TotalCost?: number;
  CostStatus?: string;
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
          {row[0].Name}
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

  function setSnackBar(message: string, severity: "error" | "warning" | "info" | "success") {
    setSnackBarMessage(message);
    setSnackBarSeverity(severity);
    setSnackbarOpen(true);
  }

  const fetchViaName = async (searchValue: string, version?: string) => {
    try {
      version = version || "0.0.0-999999.999999.999999";
      const response = await fetcher("/packages", {
        method: "POST",
        headers: { offset: "0", allflag: "true", "content-type": "application/json" },
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
      if (Object.keys(groupedData).length === 0) {
        setSnackBar("No packages found for the given search term.", "warning");
        setRows({});
        return;
      }

      // Sort each package's versions in descending order by Version number
      Object.keys(groupedData).forEach((packageName) => {
        groupedData[packageName].sort((a, b) => parseFloat(b.Version) - parseFloat(a.Version));
      });

      setRows(groupedData);
    } catch (error) {
      console.error("Error fetching packages:", error);
      setSnackBar("Error fetching packages.", "error");
    }
  };

  const fetchViaRegex = async (searchValue: string) => {
    try {
      const response = await fetcher("/package/byRegEx", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          allflag: "true"
        },
        body: JSON.stringify({ RegEx: searchValue })
      });
      const data = await response.json();
      if (response.status === 404) {
        setSnackBar("No packages found for the given search term.", "warning");
        setRows({});
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
      setRows(groupedData);
    } catch (error) {
      console.error("Error fetching packages by regex:", error);
      setSnackBar("Error fetching packages.", "error");
    }
  };

  const onSearch = (searchValue: string, searchByRegex: boolean, version?: string) => {
    setHasSearched(true);
    if (searchByRegex) {
      searchValue = searchValue.trim() === "" ? ".*" : searchValue;
      fetchViaRegex(searchValue);
    } else {
      searchValue = searchValue.trim() === "" ? "*" : searchValue;
      fetchViaName(searchValue, version);
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
      </Collapse>
    </>
  );
}
