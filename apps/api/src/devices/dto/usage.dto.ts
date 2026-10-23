import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}
