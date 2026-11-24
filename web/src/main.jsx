import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { claimWorkspace } from "./workspace.js";
import "./top-menu/top-menu.css";
import "./standalone-ui.css";
import "./components/JsonPane.css";
import "./app.css";

// Before the first API call: if another tab of this browser already holds this tab's workspace id (a duplicated tab), take a new one.
claimWorkspace().finally(() => createRoot(document.getElementById("root")).render(<App />));
