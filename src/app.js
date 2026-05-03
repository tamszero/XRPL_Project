import express from "express";
import "dotenv/config";
import walletRoutes from "./routes/wallet.js";

const app = express();
app.use(express.json());
app.use("/wallets", walletRoutes);

app.use((err, req, res, _next) => {
  console.error("에러 상세:", err);
  res.status(500).json({ error: err.message, stack: err.stack });
});

app.listen(3000, () => console.log("서버 실행: http://localhost:3000"));
