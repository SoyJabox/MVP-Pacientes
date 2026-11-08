import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgres://gestor:gestor_dev@localhost:5432/gestor_pacientes";

export const client = postgres(url);
export const db = drizzle(client, { schema });
