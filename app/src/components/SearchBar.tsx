/*
  SearchBar component is a controlled component that takes a search value and search by regex boolean as input and calls the onSearch function when the search button is clicked or the enter key is pressed. It also has a settings button that opens a menu with a checkbox to enable search by regex and a text field to enter the version to search for.
*/
import React, { useState } from "react";
import {
  TextField,
  InputAdornment,
  Button,
  Box,
  Typography,
  useTheme,
  Checkbox,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";

type SearchBarProps = {
  onSearch: (searchValue: string, searchByRegex: boolean, version?: string) => void;
};
export const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
  const [searchValue, setSearchValue] = useState("");
  const [searchByRegex, setSearchByRegex] = useState(false);
  const [version, setVersion] = useState("");
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const theme = useTheme();

  return (
    <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" width="50%" m={0}>
      <Typography variant="h4" mb={2}></Typography>
      <Box display="flex" flexDirection="row" justifyContent="center" alignItems="center" width="100%">
        <TextField
          variant="outlined"
          fullWidth
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onSearch(searchValue, searchByRegex, version);
            }
          }}
          placeholder="Type package name..."
          sx={{
            borderRadius: 0,
            boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.1)",
            "& .MuiOutlinedInput-root": {
              borderRadius: 0,
              paddingRight: 1,
              backgroundColor: "#f5f3f4"
            },
            "& .MuiInputAdornment-root": {
              marginRight: "8px"
            },
            backgroundColor: theme.palette.background.default
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
              endAdornment: (
                <>
                  <InputAdornment position="end">
                    <IconButton onClick={(event) => setAnchorEl(event.currentTarget)} aria-label="Settings">
                      <SettingsIcon />
                    </IconButton>
                  </InputAdornment>
                  <InputAdornment position="end">
                    <Button
                      variant="contained"
                      onClick={() => onSearch(searchValue, searchByRegex, version)}
                      sx={{ borderRadius: 3, background: theme.palette.primary.main }}>
                      Search
                    </Button>
                  </InputAdornment>
                </>
              )
            }
          }}
        />
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        aria-label="Settings Menu"
        sx={{
          "& .MuiPaper-root": {
            backgroundColor: theme.palette.background.paper,
            boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.1)",
            padding: 1,
            outline: "1px solid gray"
          }
        }}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right"
        }}>
        <MenuItem>
          <FormControlLabel
            control={
              <Checkbox
                checked={searchByRegex}
                onChange={(event) => setSearchByRegex(event.target.checked)}
                size="medium"
              />
            }
            label="Search By RegEx"
          />
        </MenuItem>
        {!searchByRegex && (
          <MenuItem>
            <TextField
              variant="outlined"
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              placeholder="Enter version..."
              fullWidth
              size="small"
              sx={{ marginTop: 1 }}
            />
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
};
