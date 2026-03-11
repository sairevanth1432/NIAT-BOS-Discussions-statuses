import "dotenv/config";
import express, { type Request, type Response } from "express";
import { createServer } from "http";
import { registerRoutes } from "../server/routes";

const app = express();
const httpServer = createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const initPromise = registerRoutes(httpServer, app);

export default async function handler(req: Request, res: Response) {
  await initPromise;
  return app(req, res);
}
