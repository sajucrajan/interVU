import "reflect-metadata";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

// Prisma CLI loads .env but Prisma Client at runtime does not; load it
// ourselves (native Node, no dotenv dep). Checks cwd first, then the app dir
// so `node dist/main.js` works from anywhere. Real env vars take precedence.
for (const candidate of [
  join(process.cwd(), ".env"),
  join(__dirname, "..", ".env"),
]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1", { exclude: ["healthz"] });
  // Cookie-credentialed CORS for the web app. Configure WEB_ORIGIN in
  // production; localhost default covers dev.
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? /^https?:\/\/localhost(:\d+)?$/,
    credentials: true,
  });
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`InterVU API listening on :${port}`);
}

void bootstrap();
