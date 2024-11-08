import * as React from "react";
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
  Button,
  TextField
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { PackageDisplay } from "@package-rater/shared";
import { fetcher } from "../util";
import { Search } from "@mui/icons-material";

function Row(props: { row: PackageDisplay[] }) {
  const { row } = props;
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <TableRow sx={{ "& > *": { borderBottom: "unset" } }}>
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
        <TableCell
          style={{ paddingBottom: 0, paddingTop: 0, borderBottom: "1px solid rgba(224, 224, 224, 1)" }}
          colSpan={3}>
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
                        borderBottom: "1px solid rgba(224, 224, 224, 1)"
                      }}>
                      Version Number
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{
                        fontWeight: "bold",
                        fontSize: "1rem",
                        borderBottom: "1px solid rgba(224, 224, 224, 1)"
                      }}>
                      Package ID
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{
                        fontWeight: "bold",
                        fontSize: "1rem",
                        borderBottom: "1px solid rgba(224, 224, 224, 1)"
                      }}>
                      Standalone Cost
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{
                        fontWeight: "bold",
                        fontSize: "1rem",
                        borderBottom: "1px solid rgba(224, 224, 224, 1)"
                      }}>
                      Total Cost
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{
                        fontWeight: "bold",
                        fontSize: "1rem",
                        borderBottom: "1px solid rgba(224, 224, 224, 1)"
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
                      <TableCell align="center">{version.StandaloneCost?.toFixed(2)}</TableCell>
                      <TableCell align="center">
                        {version.CostStatus === "completed"
                          ? version.TotalCost?.toFixed(2)
                          : version.CostStatus === "Pending"
                            ? "pending"
                            : "Failed"}
                      </TableCell>
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
  const [searchTerm, setSearchTerm] = React.useState("");
  const [rows, setRows] = React.useState<Record<string, PackageDisplay[]>>({});

  const fetchAllPackages = async () => {
    try {
      const response = await fetcher("/packages", {
        method: "POST",
        headers: { offset: "0", allflag: "true", "content-type": "application/json" },
        body: JSON.stringify([{ Version: "1", Name: "*" }])
      });
      // const data = await response.json();
      const data: PackageDisplay[] = await response.json();
      const groupedData: Record<string, PackageDisplay[]> = {};
      data.forEach((pkg) => {
        if (!groupedData[pkg.Name]) {
          groupedData[pkg.Name] = [];
        }
        groupedData[pkg.Name].push(pkg);
      });

      // Sort each package's versions in descending order by Version number
      Object.keys(groupedData).forEach((packageName) => {
        groupedData[packageName].sort((a, b) => parseFloat(b.Version) - parseFloat(a.Version));
      });

      setRows(groupedData);
    } catch (error) {
      console.error("Error fetching all packages:", error);
    }
  };

  const handleSearch = () => {
    if (searchTerm.trim() === "") {
      fetchAllPackages();
    }
    //  else {
    //   setRows([]); // If search term is present, don't fetch data (placeholder behavior)
    // }
  };

  // React.useEffect(() => {
  //   fetchAllPackages();
  // }, []);

  return (
    <Paper sx={{ padding: 2, width: "100%" }}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <TextField
          variant="outlined"
          placeholder="Search by package name"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <Search />
          }}
          sx={{ width: "100%" }}
        />
        <Button variant="contained" onClick={handleSearch} sx={{ ml: 2 }}>
          Search
        </Button>
      </Box>
      <TableContainer component={Paper} sx={{ marginTop: 2, borderRadius: 2, overflow: "hidden", width: "100%" }}>
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
    </Paper>
  );
}
