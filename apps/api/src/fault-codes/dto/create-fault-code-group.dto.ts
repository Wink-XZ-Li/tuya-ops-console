import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class FaultCodeGroupCodeDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(64)
  label!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;

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

export class CreateFaultCodeGroupDto {
  @IsString()
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  productIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FaultCodeGroupCodeDto)
  codes?: FaultCodeGroupCodeDto[];
}
