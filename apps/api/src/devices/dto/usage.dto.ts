import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UsageQueryDto {
  /** water | gas | energy | runtime, from the product's usageMetrics. */
  @IsString()
  @IsNotEmpty()
  metric!: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  /** `hour` for a 24-hour view. `day` for 7-day and 30-day views. Omitted → hour when the span is ≤ 48h. */
  @IsOptional()
  @IsIn(['hour', 'day'])
  bucket?: 'hour' | 'day';
}
