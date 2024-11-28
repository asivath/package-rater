import { NavBar, PackageTable } from "./components";
import { Box } from "@mui/material";
import { BrowserRouter as Router } from 'react-router-dom';

function App() {
  return (
    <Router>
      <Box display="flex" flexDirection="column" alignItems="center" height="100vh" width="100%">
        <Box position="sticky" top={0} width="100%" zIndex={1000}>
          <NavBar />
        </Box>
        <PackageTable />
      </Box>
    </Router>
  );
}

export default App;
