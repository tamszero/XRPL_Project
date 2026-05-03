import pkg from "jsonwebtoken";
import "dotenv/config";

const { verify } = pkg;

export function auth(req, res, next) {
  next();
}
