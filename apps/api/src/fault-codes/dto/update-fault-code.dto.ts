import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateFaultCodeDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  symptom?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  cause?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  suggestedAction?: string | null;

  @IsOptional()
  @IsBoolean()
  countInQualityRate?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyAftersales?: boolean;
}
