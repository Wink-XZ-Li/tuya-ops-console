import { IsIn, IsOptional, IsString } from 'class-validator';

export class DpTrendsQueryDto {
  /** Comma-separated DP codes or numeric DP ids. Omitted → product defaults or 7-day top 3. */
  @IsOptional()
  @IsString()
  dpIds?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsIn(['5min', '1h', '1d'])
  bucket?: '5min' | '1h' | '1d';
}
