import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: required("JWT_SECRET", "dev-secret-change-me"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "7d",
  PORT: Number(process.env.PORT ?? 4000),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  CORS_ORIGINS: (process.env.CORS_ORIGINS ??
    "http://localhost:5173,http://localhost:5174")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  GOLD_PROVIDER: process.env.GOLD_PROVIDER ?? "gold-api", // keyless default (gold-api.com)
  USD_AED: Number(process.env.USD_AED ?? 3.6725),
  GOLDAPI_KEY: process.env.GOLDAPI_KEY ?? "",
  METALSDEV_KEY: process.env.METALSDEV_KEY ?? "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  GOLD_INGEST_INTERVAL_MINUTES: Number(
    process.env.GOLD_INGEST_INTERVAL_MINUTES ?? 60,
  ),
};
