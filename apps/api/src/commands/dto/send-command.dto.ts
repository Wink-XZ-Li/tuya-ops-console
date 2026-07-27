import { IsDefined, IsString } from 'class-validator';

export class SendCommandDto {
  @IsString()
  code!: string;

  @IsDefined()
  value!: unknown;
}
