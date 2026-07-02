import { getDb } from "./index";

async function main() {
  const db = getDb();
  console.log("No seed data registered yet.");
  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
