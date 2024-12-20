/**
 * Theme configuration
 */
import { ThemeOptions, createTheme } from "@mui/material/styles";

const themeOptions: ThemeOptions = {
  palette: {
    mode: "light",
    primary: {
      main: "#233d4d"
    },
    secondary: {
      main: "#957100"
    },
    error: {
      main: "#ff7a7a"
    },
    warning: {
      main: "#ed6c02"
    },
    info: {
      main: "#0288d1"
    },
    success: {
      main: "#2e7d32"
    },
    divider: "rgba(0, 0, 0, 0.12)"
  }
};

export const theme = createTheme(themeOptions);
