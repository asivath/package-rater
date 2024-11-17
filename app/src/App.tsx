import { NavBar, PackageTable } from "./components";
import { Box } from "@mui/material";

function App() {
  return (
    <Box display="flex" flexDirection="column" alignItems="center" height="100vh" width="100%">
      <Box position="sticky" top={0} width="100%" zIndex={1000}>
        <NavBar />
      </Box>
      <PackageTable />
    </Box>
  );
}

export default App;
