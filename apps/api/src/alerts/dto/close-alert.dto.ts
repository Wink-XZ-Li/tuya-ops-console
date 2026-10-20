import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CloseAlertDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  reason?: string;
}
