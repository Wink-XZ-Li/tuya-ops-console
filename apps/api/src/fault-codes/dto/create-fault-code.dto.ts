import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateFaultCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  productId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  label!: string;

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
