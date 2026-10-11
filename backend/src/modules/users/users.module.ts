import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersonalDetails } from './entities/personal-details.entity';
import { User } from './entities/user.entity';
import { PersonalDetailsCodec } from './personal-details.codec';

/** People and their encrypted details; used by auth and participants. */
@Module({
  imports: [TypeOrmModule.forFeature([User, PersonalDetails])],
  providers: [PersonalDetailsCodec],
  exports: [TypeOrmModule, PersonalDetailsCodec],
})
export class UsersModule {}
