import { render } from "solid-js/web";
import "../tokens.css";
import "../app.css";
import "./dev.css";
import { DevApp } from "./DevApp";

const root = document.getElementById("root");

if (!root) {
    throw new Error("Missing #root element for the KCQ UI debug gallery.");
}

render(() => <DevApp />, root);
