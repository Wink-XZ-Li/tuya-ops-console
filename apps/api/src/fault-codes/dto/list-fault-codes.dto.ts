import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListFaultCodesDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  productId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;
}
