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
  Paper
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";

function createData(name: string, cost: number) {
  return {
    name,
    cost,
    version: [
      { versionNum: "1.5.1", packageId: "asddwf", cost: 3, netscore: 93.56 },
      { versionNum: "2.1.3", packageId: "sssdgs", cost: 1 },
      { versionNum: "2.5.3", packageId: "sssdgs", cost: 4 }
    ]
  };
}

function Row(props: { row: ReturnType<typeof createData> }) {
  const { row } = props;
  const [open, setOpen] = React.useState(false);

  return (
    <React.Fragment>
      <TableRow sx={{ "& > *": { borderBottom: "unset" } }}>
        <TableCell sx={{ width: "40px", padding: "8px" }}>
          <IconButton aria-label="expand row" size="small" onClick={() => setOpen(!open)}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell component="th" scope="row" sx={{ fontWeight: "bold", fontSize: "1.1rem" }}>
          {row.name}
        </TableCell>
        <TableCell align="right" sx={{ fontSize: "1.1rem" }}>
          {row.version.length}
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
                      Cost
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
                  {row.version.map((versionRow) => (
                    <TableRow
                      key={versionRow.versionNum}
                      sx={{
                        "&:last-child td, &:last-child th": { border: 0 }
                      }}>
                      <TableCell align="center">{versionRow.versionNum}</TableCell>
                      <TableCell align="center">{versionRow.packageId}</TableCell>
                      <TableCell align="center">{Math.round(versionRow.cost * row.cost * 100) / 100}</TableCell>
                      <TableCell align="center">
                        {versionRow.netscore !== undefined ? versionRow.netscore : "N/A"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </React.Fragment>
  );
}

const rows = [
  createData("Frozen yoghurt", 159),
  createData("Ice cream sandwich", 237),
  createData("Eclair", 262),
  createData("Cupcake", 305),
  createData("Gingerbread", 356)
];

export function PackageTable() {
  return (
    <TableContainer component={Paper} sx={{ marginTop: 4, borderRadius: 2, overflow: "hidden" }}>
      <Table aria-label="collapsible table">
        <TableHead>
          <TableRow sx={{ backgroundColor: "primary.main" }}>
            <TableCell sx={{ width: "40px" }} />
            <TableCell sx={{ color: "white", fontWeight: "bold", fontSize: "1.2rem" }}>Package Name</TableCell>
            <TableCell align="right" sx={{ color: "white", fontWeight: "bold", fontSize: "1.2rem" }}>
              Total Versions
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <Row key={row.name} row={row} />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
