// Runs once (via mongosh), the first time the Mongo volume is created.
// Creates one user per service with readWrite on its own database only (least privilege, OWASP A01).
// Values come from docker-compose.yml / .env.

const services = [
  {
    dbName: process.env.API_MONGO_DB,
    user: process.env.API_MONGO_USER,
    pwd: process.env.API_MONGO_PASSWORD,
  },
  {
    dbName: process.env.AI_MONGO_DB,
    user: process.env.AI_MONGO_USER,
    pwd: process.env.AI_MONGO_PASSWORD,
  },
];

for (const { dbName, user, pwd } of services) {
  if (!dbName || !user || !pwd) {
    throw new Error("Missing Mongo service DB/user/password environment variables");
  }
  print(`Creating Mongo user '${user}' with readWrite on '${dbName}'`);
  db.getSiblingDB(dbName).createUser({ user, pwd, roles: [{ role: "readWrite", db: dbName }] });
}
