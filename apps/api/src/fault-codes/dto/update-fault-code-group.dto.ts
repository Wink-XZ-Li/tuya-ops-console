import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { FaultCodeGroupCodeDto } from './create-fault-code-group.dto';

export class UpdateFaultCodeGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

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
