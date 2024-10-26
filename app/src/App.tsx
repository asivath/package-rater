import { SearchBar, NavBar, UploadPackageForm } from "./components";
import { Box } from "@mui/material";

function App() {
  return (
    <Box display="flex" flexDirection="column" alignItems="center" height="100vh" width="100%">
      <Box position="sticky" top={0} width="100%" zIndex={1000}>
        <NavBar />
      </Box>
      <Box display="flex" flexDirection="column" flex="1" alignItems="center" justifyContent="center" width="50%">
        <SearchBar onSearch={(searchValue) => console.error(searchValue)} />
        <UploadPackageForm />
      </Box>
    </Box>
  );
}

export default App;
