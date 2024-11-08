import { NavBar, UploadPackageForm, PackageTable } from "./components";
import { Box } from "@mui/material";

function App() {
  return (
    <Box display="flex" flexDirection="column" alignItems="center" height="100vh" width="100%">
      <Box position="sticky" top={0} width="100%" zIndex={1000}>
        <NavBar />
      </Box>
      <Box display="flex" flexDirection="column" flex="1" alignItems="center" justifyContent="flex-start" width="85%">
        <Box style={{ marginBottom: "20px" }}>
          <UploadPackageForm />
        </Box>
        {/* <Box><PackageTable/></Box> */}
        <PackageTable />
      </Box>
    </Box>
  );
}

export default App;
