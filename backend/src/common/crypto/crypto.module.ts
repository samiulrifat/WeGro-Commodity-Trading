import { Global, Module } from '@nestjs/common';
import { IdentityCryptoService } from './identity-crypto.service';
import { PasswordHasher } from './password-hasher.service';

/** Encryption of personal details and password hashing, shared app-wide. */
@Global()
@Module({
  providers: [IdentityCryptoService, PasswordHasher],
  exports: [IdentityCryptoService, PasswordHasher],
})
export class CryptoModule {}
