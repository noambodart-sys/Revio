import { config } from "dotenv";

config();
// Les tests utilisent une base dédiée : revio_test
const toTest = (url?: string) => url?.replace(/\/revio(\?|$)/, "/revio_test$1");
process.env.DATABASE_URL = toTest(process.env.DATABASE_URL);
process.env.SYSTEM_DATABASE_URL = toTest(process.env.SYSTEM_DATABASE_URL);
process.env.MIGRATION_DATABASE_URL = toTest(process.env.MIGRATION_DATABASE_URL);
process.env.SMS_PROVIDER = "console";
