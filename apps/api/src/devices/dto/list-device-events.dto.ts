import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListDeviceEventsDto {
  @IsOptional()
  @IsString()
  bizCode?: string;

  /** Comma-separated list for IN filter */
  @IsOptional()
  @IsString()
  bizCodes?: string;

  /** Comma-separated dpId / code list (OR match on payload). */
  @IsOptional()
  @IsString()
  dpId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
