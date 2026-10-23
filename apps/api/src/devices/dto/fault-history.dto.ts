import { IsIn, IsOptional, IsString } from 'class-validator';

export class FaultHistoryQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  /** `1` includes connectivity / offline alerts. Default is quality faults only. */
  @IsOptional()
  @IsString()
  includeConnectivity?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  /** `open` = unclosed only. `opened` = started inside from/to. */
  @IsOptional()
  @IsIn(['open', 'opened'])
  focus?: 'open' | 'opened';
}
