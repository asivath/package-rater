import { AppBar, Toolbar, Typography, Box, Avatar } from "@mui/material";
import { ResetButton } from "./ResetButton";
import { UploadPackageForm } from "./UploadPackage";
import logo from "../assets/logo.webp";

export const NavBar = () => {
  return (
    <AppBar position="static">
      <Toolbar>
        <Box display="flex" alignItems="center" width="100%" justifyContent="center">
          <Avatar sx={{ display: { md: "flex" }, mr: 1 }}>
            <img
              src={logo}
              style={{ width: "100%", height: "auto" }}
              alt="logo"
              width={100}
              height={100}
              loading="lazy"
            />
          </Avatar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            package-rater
          </Typography>
          <ResetButton />
          <UploadPackageForm uploadVersion={false} />
        </Box>
      </Toolbar>
      <Box
        sx={{
          height: "5px",
          background: "linear-gradient(90deg, rgba(131,58,180,1) 0%, rgba(253,29,29,1) 50%, rgba(252,176,69,1) 100%)"
        }}
      />
    </AppBar>
  );
};
