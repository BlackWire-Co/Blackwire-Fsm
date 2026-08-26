import { createApp } from "./app";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const app = createApp();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FSM backend listening on 0.0.0.0:${PORT}`);
});
