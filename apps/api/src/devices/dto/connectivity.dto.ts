import { IsOptional, IsString } from 'class-validator';

export class ConnectivityQueryDto {
  /** Window start. Omitted → 7 days before `to`. */
  @IsOptional()
  @IsString()
  from?: string;

  /** Window end. Omitted → now. */
  @IsOptional()
  @IsString()
  to?: string;
}
