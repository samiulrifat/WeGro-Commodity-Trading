import { ApiProperty } from '@nestjs/swagger';

/**
 * Small shapes that appear inside many responses, described once so the
 * OpenAPI document (and clients generated from it) name every field.
 */

/** A district (or other place) by code and name. */
export class PlaceDto {
  @ApiProperty({ example: 'BOGURA' })
  code: string;

  @ApiProperty({ example: 'Bogura' })
  name: string;
}

/** A person by id and name. */
export class PersonNameDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Rahim Uddin' })
  name: string;
}

/** A person by id, name and role. */
export class ActorDto extends PersonNameDto {
  @ApiProperty({ example: 'admin' })
  role: string;
}

/** What a notification is about. */
export class RecordLinkDto {
  @ApiProperty({ example: 'reservation' })
  type: string;

  @ApiProperty({ example: '12' })
  id: string;
}
