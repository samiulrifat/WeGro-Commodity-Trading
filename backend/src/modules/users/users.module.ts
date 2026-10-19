import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersonalDetails } from './entities/personal-details.entity';
import { PersonNameToken } from './entities/person-name-token.entity';
import { User } from './entities/user.entity';
import { NameIndexService } from './name-index.service';
import { PersonalDetailsCodec } from './personal-details.codec';
import { PersonSearch } from './person-search';

/** People and their encrypted details; used by auth and participants. */
@Module({
  imports: [TypeOrmModule.forFeature([User, PersonalDetails, PersonNameToken])],
  providers: [PersonalDetailsCodec, NameIndexService, PersonSearch],
  exports: [
    TypeOrmModule,
    PersonalDetailsCodec,
    NameIndexService,
    PersonSearch,
  ],
})
export class UsersModule {}
