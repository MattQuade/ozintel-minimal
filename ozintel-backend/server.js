import express from "express";
import cors from "cors";
import sendSMSRoute from "./routes/send-sms.js";

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", sendSMSRoute);

// Health check
app.get("/", (req, res) => {
  res.send("OzIntel Backend Running");
});

// Start server
app.listen(PORT, () => {
  console.log(`OzIntel backend listening on port ${PORT}`);
});
