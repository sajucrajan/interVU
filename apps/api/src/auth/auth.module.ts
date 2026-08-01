import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LoginContextController } from "./login-context.controller";

@Global()
@Module({
  controllers: [AuthController, LoginContextController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
