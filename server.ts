import dotenv from "dotenv";
import { createApp } from "./src/app.js";
import { PORT } from "./src/config.js";

dotenv.config();

const app = createApp();
app.listen(PORT, () => {
  console.log(`ABL proxy listening on :${PORT}`);
});
